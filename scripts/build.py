"""Build a portable, offline HTML app using only the Python standard library."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def build(root=ROOT):
    source = (root / 'src/index.html').read_text(encoding='utf-8')
    def style(match):
        content = (root / 'src' / match.group(1)).read_text(encoding='utf-8')
        return '<style>\n' + content + '\n</style>'
    def script(match):
        content = (root / 'src' / match.group(1)).read_text(encoding='utf-8')
        return '<script>\n' + content.replace('</script', '<\\/script') + '\n</script>'
    source = re.sub(r'<link rel="stylesheet" href="([a-z-]+\.css)">', style, source)
    source = re.sub(r'<script src="([a-z-]+\.js)"></script>', script, source)
    (root / 'index.html').write_text(source, encoding='utf-8')
    return source

if __name__ == '__main__':
    build()
    print('Built index.html')
