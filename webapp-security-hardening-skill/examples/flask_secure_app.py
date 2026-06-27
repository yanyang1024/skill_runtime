import os
import logging
from flask import Flask, request, jsonify

logger = logging.getLogger(__name__)
API_TOKEN = os.getenv("API_TOKEN")
PUBLIC_PATHS = {"/healthz"}

app = Flask(__name__)
app.config["DEBUG"] = False

@app.before_request
def require_token():
    if request.path in PUBLIC_PATHS:
        return None
    if not API_TOKEN:
        raise RuntimeError("API_TOKEN is required")
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or auth[7:] != API_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    return None

@app.after_request
def add_security_headers(response):
    response.headers.pop("X-Powered-By", None)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    return response

@app.errorhandler(Exception)
def handle_error(exc):
    app.logger.exception("Unhandled exception")
    return jsonify({"error": "Internal error"}), 500

@app.route("/")
def index():
    return jsonify({"status": "ok"})
