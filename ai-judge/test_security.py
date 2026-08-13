import base64
import io
import unittest

from fastapi import HTTPException
from PIL import Image

from main import decode_image


class ImageValidationTests(unittest.TestCase):
    def test_rejects_invalid_base64(self):
        with self.assertRaises(HTTPException) as caught:
            decode_image("not valid base64")
        self.assertEqual(caught.exception.status_code, 400)

    def test_accepts_a_small_valid_png(self):
        buffer = io.BytesIO()
        Image.new("RGB", (10, 10), "white").save(buffer, format="PNG")
        encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
        decoded, mime_type = decode_image(encoded)
        self.assertEqual(decoded, buffer.getvalue())
        self.assertEqual(mime_type, "image/png")

    def test_rejects_excessive_pixel_dimensions(self):
        buffer = io.BytesIO()
        Image.new("RGB", (2001, 2000), "white").save(buffer, format="PNG")
        encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
        with self.assertRaises(HTTPException) as caught:
            decode_image(encoded)
        self.assertEqual(caught.exception.status_code, 413)


if __name__ == "__main__":
    unittest.main()
