"""Lambda entrypoint for the FastAPI / Mangum application."""
from mangum import Mangum
from src.main import app

handler = Mangum(app)
