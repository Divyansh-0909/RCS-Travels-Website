import json
import pathlib
import sys
import pymupdf
sys.stdout.reconfigure(encoding='utf-8')

for value in sys.argv[1:]:
    filename = pathlib.Path(value)
    document = pymupdf.open(filename)
    pages = [page.get_text(sort=True) for page in document]
    output = filename.with_suffix('.txt')
    output.write_text('\n\n'.join(f'[PAGE {index + 1}]\n{text}' for index, text in enumerate(pages)), encoding='utf-8')
    print(json.dumps({'file': str(filename), 'pages': len(pages), 'characters': sum(map(len, pages)), 'scannedPages': [index + 1 for index, text in enumerate(pages) if len(text.strip()) < 50], 'text': str(output)}))
