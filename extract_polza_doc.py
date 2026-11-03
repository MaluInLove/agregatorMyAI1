from docx import Document

path = r"C:\Users\МоЯ\ОБуЧЕНИЕ\ВайбСубмарина\АГРегатор\Польза использование.docx"
doc = Document(path)

for paragraph in doc.paragraphs:
    text = paragraph.text.strip()
    if text:
        print(text)

for table_number, table in enumerate(doc.tables, start=1):
    print(f"\n[ТАБЛИЦА {table_number}]")
    for row in table.rows:
        print(" | ".join(cell.text.replace("\n", " ").strip() for cell in row.cells))
