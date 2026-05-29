import fitz  # PyMuPDF
import base64
from typing import Any

# Hard caps so a crafted/huge PDF can't exhaust memory.
MAX_PAGES = 200
MAX_TEXT_CHARS = 5_000_000
MAX_FIGURES = 100
MAX_IMAGE_BYTES = 8 * 1024 * 1024  # skip individual images larger than this (decoded)


def extract_text_and_figures(pdf_bytes: bytes) -> dict[str, Any]:
    """
    Extract all text and embedded images from a PDF.

    This is CPU/memory-bound and blocking; callers must invoke it via
    ``asyncio.to_thread(extract_text_and_figures, pdf_bytes)`` so it does not
    block the event loop. Output is bounded by the module-level MAX_* caps to
    protect against crafted/huge PDFs.

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
    text_len = 0
    figures: list[dict] = []

    for page_num, page in enumerate(doc):
        if page_num >= MAX_PAGES:
            break

        if text_len < MAX_TEXT_CHARS:
            page_text = page.get_text()
            text_parts.append(page_text)
            text_len += len(page_text)

        if len(figures) >= MAX_FIGURES:
            continue

        for img_index, img in enumerate(page.get_images(full=True)):
            if len(figures) >= MAX_FIGURES:
                break
            xref = img[0]
            try:
                base_image = doc.extract_image(xref)
                if len(base_image["image"]) > MAX_IMAGE_BYTES:
                    continue  # skip oversized image
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
        "text":    "\n".join(text_parts)[:MAX_TEXT_CHARS],
        "figures": figures,
    }
