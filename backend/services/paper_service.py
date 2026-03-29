import fitz  # PyMuPDF
import base64
from typing import Any


def extract_text_and_figures(pdf_bytes: bytes) -> dict[str, Any]:
    """
    Extract all text and embedded images from a PDF.

    Returns:
        {
            "text": str,      # full text of all pages concatenated
            "figures": [
                {
                    "page":   int,   # 1-indexed page number
                    "index":  int,   # image index on that page
                    "data":   str,   # base64-encoded image bytes
                    "ext":    str,   # image format, e.g. "png", "jpeg"
                    "width":  int,
                    "height": int,
                }
            ]
        }
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text_parts: list[str] = []
    figures: list[dict] = []

    for page_num, page in enumerate(doc):
        text_parts.append(page.get_text())

        for img_index, img in enumerate(page.get_images(full=True)):
            xref = img[0]
            try:
                base_image = doc.extract_image(xref)
                figures.append({
                    "page":   page_num + 1,
                    "index":  img_index,
                    "data":   base64.b64encode(base_image["image"]).decode("utf-8"),
                    "ext":    base_image["ext"],
                    "width":  base_image["width"],
                    "height": base_image["height"],
                })
            except Exception:
                continue  # skip unreadable images

    doc.close()
    return {
        "text":    "\n".join(text_parts),
        "figures": figures,
    }
