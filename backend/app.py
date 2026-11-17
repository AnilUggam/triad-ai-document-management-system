import os
from datetime import timedelta

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv

from auth import auth_bp
from documents import (
    documents_bp,
    list_documents,
    download_document,
    request_document_access,
    update_access_request,
    search_documents
)
from metadata import metadata_bp

load_dotenv()

app = Flask(__name__)

app.config["SECRET_KEY"] = os.getenv("SECRET_KEY")
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=2)

CORS(app)

jwt = JWTManager(app)

# Existing blueprints
app.register_blueprint(auth_bp, url_prefix="/api/auth")
app.register_blueprint(documents_bp, url_prefix="/api/documents")
app.register_blueprint(metadata_bp, url_prefix="/api/metadata")


# --------------------------------------------------
# COMPANY-REQUIRED API COMPATIBILITY ROUTES
# --------------------------------------------------

# GET /api/documents
app.add_url_rule(
    "/api/documents",
    endpoint="company_list_documents",
    view_func=list_documents,
    methods=["GET"]
)

# GET /api/documents/<document_id>/download
app.add_url_rule(
    "/api/documents/<document_id>/download",
    endpoint="company_download_document",
    view_func=download_document,
    methods=["GET"]
)

# POST /api/access/request
app.add_url_rule(
    "/api/access/request",
    endpoint="company_request_access",
    view_func=request_document_access,
    methods=["POST"]
)

# POST /api/search?q=...
app.add_url_rule(
    "/api/search",
    endpoint="company_search_documents",
    view_func=search_documents,
    methods=["GET"]
)


# POST /api/access/approve
def company_approve_access():

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Request body must be a JSON object"
        }), 400

    request_id = data.get("request_id")

    if not isinstance(request_id, str):
        return jsonify({
            "error": "request_id is required"
        }), 400

    # Existing function checks admin role, division ownership
    # and pending status. Approval defaults to "approved".
    return update_access_request(request_id)


app.add_url_rule(
    "/api/access/approve",
    endpoint="company_approve_access",
    view_func=company_approve_access,
    methods=["POST"]
)


# --------------------------------------------------
# HEALTH CHECK
# --------------------------------------------------

@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "message": "TRIAD AI DMS Backend is running!",
        "status": "success"
    }), 200


if __name__ == "__main__":
    app.run(debug=True, port=5000)