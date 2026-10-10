# Fixed program; requirement text arrives through stdin, never as PowerShell code.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    if ($request.appId -ne 'dev.11eleve.requirement-calendar') { throw 'Invalid application ID' }
    $null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    $null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
    $null = [Windows.UI.Notifications.ScheduledToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime]
    $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($request.appId)
    $desired = @{}
    foreach ($plan in $request.plans) {
        if ($plan.id -notmatch '^rc[0-9a-f]{14}$' -or $plan.url -notlike 'requirement-calendar://requirement/*') { throw 'Invalid notification' }
        $due = [DateTimeOffset]::Parse($plan.due, [Globalization.CultureInfo]::InvariantCulture)
        if ($due -le [DateTimeOffset]::Now) { continue }
        $title = [Security.SecurityElement]::Escape([string]$plan.title)
        $launch = [Security.SecurityElement]::Escape([string]$plan.url)
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml("<toast activationType=`"protocol`" launch=`"$launch`"><visual><binding template=`"ToastGeneric`"><text>$title</text><text>需求提醒</text></binding></visual></toast>")
        $desired[$plan.id] = @{ due = $due; xml = $xml }
    }
    # Cancel removed/changed reminders even if the user has disabled notifications.
    foreach ($existing in $notifier.GetScheduledToastNotifications()) {
        if ($existing.Id -notmatch '^rc[0-9a-f]{14}$') { continue }
        $next = $desired[$existing.Id]
        if ($null -ne $next -and $existing.DeliveryTime -eq $next.due -and $existing.Content.GetXml() -eq $next.xml.GetXml()) {
            $desired.Remove($existing.Id)
        } else { $notifier.RemoveFromSchedule($existing) }
    }
    if ($request.plans.Count -gt 0 -and $notifier.Setting.ToString() -ne 'Enabled') { throw '请在 Windows 设置 → 系统 → 通知中允许需求日历发送通知。' }
    foreach ($id in $desired.Keys) {
        $next = $desired[$id]
        $toast = [Windows.UI.Notifications.ScheduledToastNotification]::new($next.xml, $next.due)
        $toast.Id = $id
        $toast.Tag = $id
        $toast.Group = 'requirements'
        $notifier.AddToSchedule($toast)
    }
    @{ ok = $true } | ConvertTo-Json -Compress
} catch {
    @{ ok = $false; issue = $_.Exception.Message } | ConvertTo-Json -Compress
    exit 1
}
