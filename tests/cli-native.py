"""End-to-end real compiled CLI -> per-user Unix socket -> native WebKit -> disk."""
from pathlib import Path
import json, os, socket, stat, subprocess, tempfile, time
ROOT=Path(__file__).resolve().parents[1]
APP=ROOT/'dist/需求日历.app/Contents/MacOS/RequirementCalendar'
CLI=APP.with_name('reqcal')
checks=[]
def check(value,label):
    assert value,label
    checks.append(label)
with tempfile.TemporaryDirectory(prefix='rc-cli-',dir='/private/tmp') as tmp:
    directory=Path(tmp); env={**os.environ,'CALENDAR_EPHEMERAL':'1','CALENDAR_DATA_DIR':tmp}
    for key in ['CALENDAR_VERIFY_SCRIPT','CALENDAR_VERIFY_OUTPUT','CALENDAR_DEMO','CALENDAR_DISABLE_COMMANDS']:
        env.pop(key,None)
    log=(directory/'native.log').open('w')
    app=None
    def start():
        global app
        app=subprocess.Popen([str(APP),"--command-background"],env=env,stdout=log,stderr=log)
        deadline=time.monotonic()+20
        while time.monotonic()<deadline:
            if app.poll() is not None: raise AssertionError('app exited: '+(directory/'native.log').read_text())
            if (directory/'command.sock').exists():
                try:
                    probe=socket.socket(socket.AF_UNIX);probe.connect(str(directory/'command.sock'));probe.close();return
                except OSError: pass
            time.sleep(.05)
        raise AssertionError('native command socket did not start')
    def cli(*args,code=0):
        result=subprocess.run([str(CLI),'--data-dir',tmp,'--no-launch',*args],capture_output=True,text=True,timeout=25)
        assert result.returncode==code,(args,result.returncode,result.stdout,result.stderr)
        return json.loads(result.stdout)
    try:
        start()
        check(stat.S_IMODE((directory/'command.sock').stat().st_mode)==0o600,'command socket is restricted to its owner')
        check(cli('status')['data']['count']==0,'a real CLI connects to an empty isolated application')
        schema=cli('schema');check('create' in schema['data']['commands'],'CLI exposes machine-readable command documentation')
        item={'id':'cli-login','title':'登录优化','start':'2026-10-12','end':'2026-10-16','phases':[{'name':'开发','start':'2026-10-12','end':'2026-10-15'}],'milestones':[{'id':'ship','name':'上线','kind':'release','date':'2026-10-16'}],'tasks':['实现','验收'],'note':'  原样保留\n`$(echo literal)`'}
        created=cli('create','--json',json.dumps(item,ensure_ascii=False))
        check(created['ok'] and created['changed'],'CLI creation is acknowledged after native persistence')
        saved=json.loads((directory/'calendar.json').read_text());check(saved['requirements'][0]['note']==item['note'],'literal notes and Unicode reach the real JSON file unchanged')
        check(len(cli('list','--from','2026-10-15','--to','2026-10-17')['data'])==1,'CLI interval filtering finds overlapping requirements')
        check(cli('get','cli-login')['data']['id']=='cli-login','CLI can read one stable requirement ID')
        revision=created['revision'];updated=cli('update','cli-login','--json','{"note":"已确认接口"}','--if-revision',revision)
        check(updated['data']['note']=='已确认接口','a revision-checked patch persists')
        check(cli('delete','cli-login','--if-revision',revision,code=3)['error']['code']=='REVISION_CONFLICT','stale CLI writes cannot overwrite new data')
        shifted=cli('shift','cli-login','--days','2');check(shifted['data']['milestones'][0]['date']=='2026-10-18','CLI shifting keeps phases and nodes aligned')
        check(cli('create','--json',json.dumps(item),code=2)['error']['code']=='ALREADY_EXISTS','repeated stable IDs do not duplicate requirements')
        check(cli('update','cli-login','--json','{"end":"bad"}',code=2)['error']['code']=='VALIDATION_FAILED','invalid CLI dates fail before any write')
        export=directory/'export.json';cli('export','--output',str(export));exported=json.loads(export.read_text())
        check(exported['requirements'][0]['id']=='cli-login','CLI exports a directly importable versioned JSON file')
        check(cli('preview-import',str(export))['data']['skipped']==1,'import preview detects duplicates without writing')
        check(cli('import',str(export))['data']['skipped']==1,'default CLI import preserves duplicate requirements')
        check(cli('import',str(export),'--mode','copy')['data']['added']==1,'explicit copy imports independent new IDs')
        check((directory/'calendar.last-good.json').exists(),'command writes preserve a last-good backup')
        check(cli('import',str(export),'--mode','replace',code=2)['error']['code']=='INVALID_ARGUMENT','whole-calendar replacement requires an observed revision')
        revision=cli('status')['revision'];cli('import',str(export),'--mode','replace','--if-revision',revision)
        check(any(directory.glob('calendar.before-restore-*.json')),'whole-calendar replacement archives prior data independently')
        request=directory/'request.json';request.write_text(json.dumps({'action':'eval','script':'bad'}))
        check(cli('request','--file',str(request),code=2)['error']['code']=='UNKNOWN_COMMAND','the command endpoint rejects arbitrary code execution')
        client=socket.socket(socket.AF_UNIX);client.connect(str(directory/'command.sock'));client.sendall(b'not-json\n');response=json.loads(client.recv(4096));client.close()
        check(response['error']['code']=='INVALID_JSON','malformed socket messages are rejected without affecting the server')
        app.terminate();app.wait(timeout=5);start()
        check(cli('get','cli-login')['data']['note']=='已确认接口','a full native process restart reloads CLI-created data')
        check(cli('delete','cli-login')['data']['deleted'] and cli('list')['data']==[],'CLI deletion targets only the named requirement')
    finally:
        if app and app.poll() is None: app.terminate();app.wait(timeout=5)
        log.close()
(ROOT/'.build/month-wheel/cli-native.json').write_text(json.dumps({'ok':True,'checks':checks},ensure_ascii=False,indent=2)+'\n')
print(str(len(checks))+' end-to-end native CLI checks passed')
