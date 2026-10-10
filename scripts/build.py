"""Build the shared offline interface into dist/web; never rewrite source files."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def build(root=ROOT):
    root = Path(root).resolve()
    source = (root / 'index.html').read_text(encoding='utf-8')
    def read_source(name):
        path = (root / name).resolve()
        if not path.is_relative_to(root / 'src'):
            raise ValueError('Build inputs must be inside src/')
        return path.read_text(encoding='utf-8')
    def style(match):
        content = read_source(match.group(1))
        return '<style>\n' + content + '\n</style>'
    def script(match):
        content = read_source(match.group(1))
        return '<script>\n' + content.replace('</script', '<\\/script') + '\n</script>'
    source = re.sub(r'<link rel="stylesheet" href="(src/[^"<>]+\.css)">', style, source)
    source = re.sub(r'<script src="(src/[^"<>]+\.js)"></script>', script, source)
    output = root / 'dist/web/index.html'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(source, encoding='utf-8')
    return source

if __name__ == '__main__':
    build()
    print('Built dist/web/index.html')
