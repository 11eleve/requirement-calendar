// A console client and a private pipe broker. Targets the Windows .NET Framework
// so installed users do not need Node, PowerShell profiles, or an extra runtime.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Pipes;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;

internal sealed class CliError : Exception {
    internal readonly string Code;
    internal CliError(string code, string message) : base(message) { Code = code; }
}

internal static class Reqcal {
    const int InputLimit = 16 * 1024 * 1024, ResponseLimit = 64 * 1024 * 1024;
    static readonly Encoding Utf8 = new UTF8Encoding(false, true);
    static readonly string Executable = Path.GetFullPath(Assembly.GetExecutingAssembly().Location);
    static readonly object OutputLock = new object();
    static volatile TaskCompletionSource<string> pending;
    static int sequence;
    static JavaScriptSerializer Json() { return new JavaScriptSerializer { MaxJsonLength = ResponseLimit, RecursionLimit = 128 }; }
    static Dictionary<string, object> Object(object value, string label) {
        var result = value as Dictionary<string, object>;
        if (result == null) throw new CliError("INVALID_ARGUMENT", label + "必须是 JSON 对象。");
        return result;
    }
    static object Parse(string raw) {
        try { return Json().DeserializeObject(raw.TrimStart('\uFEFF')); }
        catch (Exception error) { throw new CliError("INVALID_JSON", "JSON 无效：" + error.Message); }
    }
    static object Value(Dictionary<string, object> item, string key) { object value; return item.TryGetValue(key, out value) ? value : null; }
    static Dictionary<string, object> Error(string code, string message) {
        return new Dictionary<string, object> { {"ok", false}, {"error", new Dictionary<string, object> { {"code", code}, {"message", message} }} };
    }
    static void Output(object value) { lock (OutputLock) { Console.WriteLine(Json().Serialize(value)); Console.Out.Flush(); } }
    static string DataDirectory(string supplied) {
        return Path.GetFullPath(supplied ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "RequirementCalendar", "data")).TrimEnd(Path.DirectorySeparatorChar);
    }
    static string PipeName(string directory) {
        string identity = WindowsIdentity.GetCurrent().User.Value + "\n" + DataDirectory(directory).ToUpperInvariant();
        using (var hash = SHA256.Create()) return "requirement-calendar-" + BitConverter.ToString(hash.ComputeHash(Utf8.GetBytes(identity))).Replace("-", "").ToLowerInvariant();
    }

    [StructLayout(LayoutKind.Sequential)] struct SecurityAttributes {
        internal int Length;
        internal IntPtr Descriptor;
        [MarshalAs(UnmanagedType.Bool)] internal bool Inherit;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern SafePipeHandle CreateNamedPipe(string name, uint openMode, uint pipeMode, uint instances, uint outputSize, uint inputSize, uint timeout, ref SecurityAttributes attributes);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetNamedPipeServerProcessId(SafePipeHandle pipe, out uint processId);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CancelIoEx(SafePipeHandle handle, IntPtr overlapped);

    static NamedPipeServerStream CreateServer(string name) {
        var sid = WindowsIdentity.GetCurrent().User;
        var security = new PipeSecurity();
        security.SetAccessRuleProtection(true, false);
        security.SetOwner(sid);
        security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.NetworkSid, null), PipeAccessRights.FullControl, AccessControlType.Deny));
        security.AddAccessRule(new PipeAccessRule(sid, PipeAccessRights.FullControl, AccessControlType.Allow));
        var descriptor = security.GetSecurityDescriptorBinaryForm();
        var pinned = GCHandle.Alloc(descriptor, GCHandleType.Pinned);
        try {
            var attributes = new SecurityAttributes { Length = Marshal.SizeOf(typeof(SecurityAttributes)), Descriptor = pinned.AddrOfPinnedObject(), Inherit = false };
            // Duplex, overlapped, first-instance ownership; byte mode, local clients only.
            var handle = CreateNamedPipe(@"\\.\pipe\" + name, 0x00000003 | 0x40000000 | 0x00080000, 0x00000008, 1, 65536, 65536, 0, ref attributes);
            if (handle.IsInvalid) { handle.Dispose(); throw new CliError("ENDPOINT_UNAVAILABLE", "无法创建独占命名管道：" + Marshal.GetLastWin32Error()); }
            return new NamedPipeServerStream(PipeDirection.InOut, true, false, handle);
        } finally { pinned.Free(); }
    }
    static async Task<string> ReadFrame(Stream stream, int limit) {
        using (var data = new MemoryStream()) {
            var buffer = new byte[8192];
            for (;;) {
                int count = await stream.ReadAsync(buffer, 0, buffer.Length).ConfigureAwait(false);
                if (count == 0) throw new CliError("CONNECTION_FAILED", "连接已中断；请查询已有记录后再重试写入。");
                int end = Array.IndexOf(buffer, (byte)10, 0, count);
                int take = end < 0 ? count : end;
                if (data.Length + take > limit) throw new CliError("TOO_LARGE", "JSON 超过允许大小。");
                data.Write(buffer, 0, take);
                if (end >= 0) return Utf8.GetString(data.ToArray());
            }
        }
    }
    static async Task WriteFrame(Stream stream, string raw) {
        var bytes = Utf8.GetBytes(raw + "\n");
        await stream.WriteAsync(bytes, 0, bytes.Length).ConfigureAwait(false);
        await stream.FlushAsync().ConfigureAwait(false);
    }
    static void Abort(Task task, IDisposable connection) {
        var server = connection as NamedPipeServerStream;
        if (server == null) connection.Dispose();
        else {
            CancelIoEx(server.SafePipeHandle, IntPtr.Zero);
            try { task.Wait(1000); } catch { }
        }
    }
    static T Timed<T>(Task<T> task, IDisposable connection) {
        if (!task.Wait(25000)) { Abort(task, connection); throw new CliError("CONNECTION_FAILED", "等待应用确认超时；请查询数据后再重试写入。"); }
        return task.GetAwaiter().GetResult();
    }
    static void Timed(Task task, IDisposable connection) {
        if (!task.Wait(25000)) { Abort(task, connection); throw new CliError("CONNECTION_FAILED", "等待应用确认超时；请查询数据后再重试写入。"); }
        task.GetAwaiter().GetResult();
    }

    static int Serve(string directory) {
        using (var pipe = CreateServer(PipeName(directory))) {
            Task.Run(() => {
                try {
                    string line;
                    while ((line = Console.ReadLine()) != null) {
                        var reply = Object(Parse(line), "宿主响应");
                        int id = Convert.ToInt32(Value(reply, "id"), CultureInfo.InvariantCulture);
                        var waiter = pending;
                        if (waiter != null && id == sequence) waiter.TrySetResult(Json().Serialize(Value(reply, "response")));
                    }
                } catch (Exception error) { Console.Error.WriteLine(error.Message); }
                // Parent closed its inherited stdin; do not leave an orphan broker.
                Environment.Exit(0);
            });
            Output(new Dictionary<string, object> { {"ready", true}, {"pipe", PipeName(directory)} });
            for (;;) {
                pipe.WaitForConnection();
                try {
                    string raw = Timed(ReadFrame(pipe, InputLimit), pipe);
                    var request = Object(Parse(raw), "指令");
                    int id = ++sequence;
                    pending = new TaskCompletionSource<string>();
                    Output(new Dictionary<string, object> { {"id", id}, {"request", request} });
                    string response = Timed(pending.Task, pipe);
                    Timed(WriteFrame(pipe, response), pipe);
                } catch (Exception error) {
                    var actual = error is AggregateException ? error.GetBaseException() : error;
                    var cli = actual as CliError;
                    try { Timed(WriteFrame(pipe, Json().Serialize(Error(cli == null ? "INVALID_JSON" : cli.Code, actual.Message))), pipe); } catch { }
                } finally {
                    pending = null;
                    if (!pipe.SafePipeHandle.IsClosed && pipe.IsConnected) pipe.Disconnect();
                }
            }
        }
    }

    static NamedPipeClientStream Connect(string name, int timeout) {
        var pipe = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous, TokenImpersonationLevel.Identification);
        try {
            pipe.Connect(timeout);
            uint pid;
            if (!GetNamedPipeServerProcessId(pipe.SafePipeHandle, out pid)) throw new CliError("UNSAFE_ENDPOINT", "无法确认命令行服务的身份。");
            using (var process = Process.GetProcessById((int)pid)) {
                if (!String.Equals(Path.GetFullPath(process.MainModule.FileName), Executable, StringComparison.OrdinalIgnoreCase))
                    throw new CliError("UNSAFE_ENDPOINT", "命令行服务来自其他程序或其他安装目录，请退出旧版应用后重试。");
            }
            return pipe;
        } catch { pipe.Dispose(); throw; }
    }
    static string Quote(string value) {
        // Windows CommandLineToArgvW escaping, including trailing backslashes.
        var result = new StringBuilder("\""); int slashes = 0;
        foreach (char c in value) {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') result.Append('\\', slashes * 2 + 1).Append(c);
            else result.Append('\\', slashes).Append(c);
            slashes = 0;
        }
        return result.Append('\\', slashes * 2).Append('"').ToString();
    }
    static string ReadInput(string file) {
        using (var stream = file == "-" ? Console.OpenStandardInput() : File.OpenRead(file))
        using (var data = new MemoryStream()) {
            var buffer = new byte[8192]; int count;
            while ((count = stream.Read(buffer, 0, buffer.Length)) > 0) {
                if (data.Length + count > InputLimit) throw new CliError("TOO_LARGE", "JSON 文件不能超过 16 MB。");
                data.Write(buffer, 0, count);
            }
            return Utf8.GetString(data.ToArray());
        }
    }
    static void Export(string destination, object data) {
        string target = Path.GetFullPath(destination), temporary = target + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try {
            using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
                var bytes = Utf8.GetBytes(Json().Serialize(data) + "\n"); file.Write(bytes, 0, bytes.Length); file.Flush(true);
            }
            if (File.Exists(target)) File.Replace(temporary, target, null); else File.Move(temporary, target);
        } finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    const string Help = @"需求日历 Windows 命令行 reqcal

  reqcal list [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--query 文字]
  reqcal get ID
  reqcal create --file requirement.json       (--file - 从标准输入读取)
  reqcal create --json JSON
  reqcal update ID --file patch.json [--if-revision REVISION]
  reqcal shift ID --days 3 [--if-revision REVISION]
  reqcal delete ID [--if-revision REVISION]
  reqcal preview-import requirements.json [--mode merge|update|copy|replace]
  reqcal import requirements.json [--mode merge|update|copy|replace]
  reqcal export [--output requirements.json] [--from DATE] [--to DATE]
  reqcal schema
  reqcal status
  reqcal request --file command.json

输出 JSON；成功的写操作已经持久化。未保存草稿返回 DRAFT_DIRTY。
替换全部需求必须提供 --if-revision；过期版本返回 REVISION_CONFLICT。
应用未运行时自动后台启动同目录的 RequirementCalendar.exe。
高级选项：--no-launch --data-dir DIR --app EXE_PATH。
退出码：0 成功；2 参数/校验错误；3 草稿/版本/忙碌冲突；4 连接/保存失败。";

    static int Client(string[] args) {
        if (args.Length == 0 || Array.IndexOf(args, "--help") >= 0 || Array.IndexOf(args, "-h") >= 0) { Console.WriteLine(Help); return 0; }
        var options = new Dictionary<string, string>(); var positional = new List<string>(); bool noLaunch = false;
        var names = new HashSet<string>(new [] {"--from","--to","--query","--json","--file","--mode","--output","--days","--if-revision","--data-dir","--app"});
        for (int i = 0; i < args.Length; i++) {
            string token = args[i];
            if (token == "--no-launch") noLaunch = true;
            else if (token.StartsWith("--", StringComparison.Ordinal)) {
                if (!names.Contains(token) || options.ContainsKey(token) || ++i >= args.Length) throw new CliError("INVALID_ARGUMENT", "无效、重复或缺少值的选项：" + token);
                options[token] = args[i];
            } else positional.Add(token);
        }
        if (positional.Count == 0) throw new CliError("INVALID_ARGUMENT", "需要指令，使用 --help 查看说明。");
        string action = positional[0];
        if (Array.IndexOf(new [] {"list","get","create","update","shift","delete","import","export","preview-import","schema","status","request"}, action) < 0)
            throw new CliError("UNKNOWN_COMMAND", "未知指令：" + action);
        var request = new Dictionary<string, object> { {"action", action} };
        var allowed = new HashSet<string>(new [] {"--data-dir","--app"});
        if (action == "list" || action == "export") foreach (string key in new [] {"from","to","query"}) { allowed.Add("--" + key); if (options.ContainsKey("--" + key)) request[key] = options["--" + key]; }
        if (action == "export") allowed.Add("--output");
        if (action == "create" || action == "update" || action == "request") {
            allowed.Add("--json"); allowed.Add("--file");
            if (options.ContainsKey("--json") == options.ContainsKey("--file")) throw new CliError("INVALID_ARGUMENT", "请选择 --json 或 --file 提供 JSON。");
            string raw = options.ContainsKey("--json") ? options["--json"] : ReadInput(options["--file"]);
            if (Utf8.GetByteCount(raw) > InputLimit) throw new CliError("TOO_LARGE", "JSON 不能超过 16 MB。");
            var value = Parse(raw);
            if (action == "request") request = Object(value, "原始指令"); else request["data"] = value;
        }
        if (action == "get" || action == "update" || action == "shift" || action == "delete") {
            if (positional.Count != 2) throw new CliError("INVALID_ARGUMENT", action + " 需要一个需求 ID。"); request["id"] = positional[1];
        } else if (action == "import" || action == "preview-import") {
            if (positional.Count != 2) throw new CliError("INVALID_ARGUMENT", "需要 JSON 文件路径，或 - 表示标准输入。");
            request["data"] = Parse(ReadInput(positional[1])); allowed.Add("--mode"); if (options.ContainsKey("--mode")) request["mode"] = options["--mode"];
        } else if (positional.Count != 1) throw new CliError("INVALID_ARGUMENT", "多余的位置参数。");
        if (action == "shift") {
            allowed.Add("--days"); int days;
            if (!options.ContainsKey("--days") || !Int32.TryParse(options["--days"], NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out days)) throw new CliError("INVALID_ARGUMENT", "--days 必须是整数。");
            request["days"] = days;
        }
        if (Array.IndexOf(new [] {"create","update","shift","delete","import","request"}, action) >= 0) { allowed.Add("--if-revision"); if (options.ContainsKey("--if-revision")) request["expectedRevision"] = options["--if-revision"]; }
        foreach (string key in options.Keys) if (!allowed.Contains(key)) throw new CliError("INVALID_ARGUMENT", action + " 不支持选项 " + key);
        if (action == "import" && Convert.ToString(Value(request, "mode")) == "replace" && !options.ContainsKey("--if-revision")) throw new CliError("INVALID_ARGUMENT", "替换全部需求需要 --if-revision。");
        string directory = DataDirectory(options.ContainsKey("--data-dir") ? options["--data-dir"] : null), name = PipeName(directory);
        NamedPipeClientStream connection;
        try { connection = Connect(name, 250); }
        catch (TimeoutException) {
            if (noLaunch) throw new CliError("APP_NOT_RUNNING", "需求日历未运行或命令行尚未就绪。");
            string app = options.ContainsKey("--app") ? Path.GetFullPath(options["--app"]) : Path.Combine(Path.GetDirectoryName(Executable), "RequirementCalendar.exe");
            if (!File.Exists(app)) throw new CliError("APP_NOT_RUNNING", "找不到同目录应用，请通过 --app 指定 RequirementCalendar.exe。");
            string arguments = "--command-background";
            if (options.ContainsKey("--data-dir")) arguments += " --calendar-data-dir " + Quote(directory);
            var launched = Process.Start(new ProcessStartInfo(app, arguments) { UseShellExecute = true, WindowStyle = ProcessWindowStyle.Hidden, WorkingDirectory = Path.GetDirectoryName(app) });
            launched.Dispose();
            try { connection = Connect(name, 15000); }
            catch (TimeoutException) { throw new CliError("APP_NOT_RUNNING", "自动启动后仍无法连接，请打开新版应用后重试。"); }
        }
        Dictionary<string, object> response;
        using (connection) {
            string raw = Json().Serialize(request);
            if (Utf8.GetByteCount(raw) > InputLimit) throw new CliError("TOO_LARGE", "指令超过 16 MB。");
            Timed(WriteFrame(connection, raw), connection);
            response = Object(Parse(Timed(ReadFrame(connection, ResponseLimit), connection)), "应用响应");
        }
        bool ok = Value(response, "ok") is bool && (bool)response["ok"];
        if (ok && options.ContainsKey("--output")) {
            Export(options["--output"], Value(response, "data"));
            Output(new Dictionary<string, object> { {"ok", true}, {"revision", Value(response, "revision")}, {"file", Path.GetFullPath(options["--output"])}, {"bytes", new FileInfo(options["--output"]).Length} });
        } else Output(response);
        if (ok) return 0;
        string code = Convert.ToString(Value(Object(Value(response, "error"), "错误"), "code"));
        return Array.IndexOf(new [] {"BUSY","DRAFT_DIRTY","REVISION_CONFLICT"}, code) >= 0 ? 3 : Array.IndexOf(new [] {"SAVE_FAILED","INTERNAL_ERROR","APP_NOT_RUNNING"}, code) >= 0 ? 4 : 2;
    }
    public static int Main(string[] args) {
        Console.OutputEncoding = new UTF8Encoding(false); Console.InputEncoding = new UTF8Encoding(false);
        try {
            if (args.Length == 2 && args[0] == "--serve") return Serve(DataDirectory(args[1]));
            if (args.Length == 2 && args[0] == "--endpoint") { Output(new Dictionary<string, object> { {"pipe", PipeName(args[1])} }); return 0; }
            return Client(args);
        } catch (Exception error) {
            var actual = error is AggregateException ? error.GetBaseException() : error;
            var cli = actual as CliError;
            string code = cli == null ? "IO_ERROR" : cli.Code;
            Output(Error(code, actual.Message));
            return Array.IndexOf(new [] {"INVALID_ARGUMENT","INVALID_JSON","UNKNOWN_COMMAND","TOO_LARGE"}, code) >= 0 ? 2 : 4;
        }
    }
}
