import pytest
import fitz  # PyMuPDF
import io
from backend.services.paper_service import extract_text_and_figures


def make_pdf_with_text(text: str) -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 72), text)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def make_pdf_with_image() -> bytes:
    from PIL import Image
    doc = fitz.open()
    page = doc.new_page()
    img = Image.new("RGB", (100, 100), color=(255, 0, 0))
    img_buf = io.BytesIO()
    img.save(img_buf, format="PNG")
    img_buf.seek(0)
    page.insert_image(fitz.Rect(50, 50, 150, 150), stream=img_buf.read())
    page.insert_text((50, 200), "Figure 1. A red square.")
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def test_extracts_text():
    pdf = make_pdf_with_text("Abstract\nThis is the abstract.")
    result = extract_text_and_figures(pdf)
    assert "text" in result
    assert "Abstract" in result["text"]


def test_returns_figures_list():
    pdf = make_pdf_with_text("No images here.")
    result = extract_text_and_figures(pdf)
    assert "figures" in result
    assert isinstance(result["figures"], list)


def test_extracts_images():
    pdf = make_pdf_with_image()
    result = extract_text_and_figures(pdf)
    assert len(result["figures"]) >= 1
    fig = result["figures"][0]
    assert "data" in fig       # base64-encoded image
    assert "page" in fig
    assert "width" in fig
    assert "height" in fig


def test_empty_pdf_returns_empty_text():
    doc = fitz.open()
    doc.new_page()
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    result = extract_text_and_figures(buf.getvalue())
    assert result["text"].strip() == ""
    assert result["figures"] == []
