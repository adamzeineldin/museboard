"""Regenerate the tiny resume fixtures used by src/lib/resume tests.

Run from the repo root:  python3 -I src/lib/resume/__fixtures__/generate_fixtures.py
Writes resume.pdf (one page, text layer), resume.docx (minimal WordprocessingML) and resume.txt.
Stdlib only; the output is deterministic.
"""
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
LINES = ["Jordan Lee - Software Engineer", "Skills: Python, TypeScript, Go", "Built a Raft key-value store in Go."]


def write_pdf(path):
    text_ops = ["BT", "/F1 12 Tf", "72 720 Td", "14 TL"]
    for line in LINES:
        safe = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        text_ops.append(f"({safe}) Tj T*")
    text_ops.append("ET")
    stream = "\n".join(text_ops).encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    with open(path, "wb") as handle:
        handle.write(out)


CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""


def write_docx(path):
    paragraphs = "".join(f"<w:p><w:r><w:t xml:space=\"preserve\">{line}</w:t></w:r></w:p>" for line in LINES)
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{paragraphs}</w:body></w:document>"
    )
    fixed = (1980, 1, 1, 0, 0, 0)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in (("[Content_Types].xml", CONTENT_TYPES), ("_rels/.rels", RELS), ("word/document.xml", document)):
            archive.writestr(zipfile.ZipInfo(name, date_time=fixed), data)


def write_txt(path):
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(LINES) + "\n")


if __name__ == "__main__":
    write_pdf(os.path.join(HERE, "resume.pdf"))
    write_docx(os.path.join(HERE, "resume.docx"))
    write_txt(os.path.join(HERE, "resume.txt"))
