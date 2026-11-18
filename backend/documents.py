
import os
import json
import re
import logging

from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from bson import ObjectId
from datetime import datetime
from io import BytesIO

from PIL import Image, ImageOps
import pytesseract
import pymupdf as fitz

from database import (
    fs,
    users_collection,
    documents_collection,
    access_requests_collection,
    metadata_fields_collection
)

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

documents_bp = Blueprint("documents", __name__)


# --------------------------------------------------
# HELPERS
# --------------------------------------------------

def get_current_user():
    user_id = get_jwt_identity()

    if not ObjectId.is_valid(user_id):
        return None

    return users_collection.find_one({
        "_id": ObjectId(user_id)
    })


def user_can_access_document(user, document):
    if not user or not document:
        return False

    if document.get("division") == user.get("division"):
        return True

    approved = access_requests_collection.find_one({
        "document_id": document["file_id"],
        "requester_id": str(user["_id"]),
        "status": "approved"
    })

    return approved is not None


def document_response(doc):
    return {
        "document_id": str(doc["file_id"]),
        "filename": doc["filename"],
        "division": doc.get("division"),
        "content_type": doc.get("content_type"),
        "upload_date": (
            doc["upload_date"].isoformat()
            if doc.get("upload_date")
            else None
        ),
        "metadata": doc.get("metadata", {}),
        "is_shared": bool(doc.get("is_shared", False))
    }


# --------------------------------------------------
# OCR TEXT EXTRACTION
# --------------------------------------------------

def extract_text(file, filename):
    extension = os.path.splitext(filename)[1].lower()

    try:
        if extension == ".txt":
            return file.read().decode("utf-8", errors="ignore")

        elif extension == ".pdf":
            pdf_document = fitz.open(
                stream=file.read(),
                filetype="pdf"
            )

            extracted_text = ""

            for page in pdf_document:
                page_text = page.get_text().strip()

                if page_text:
                    extracted_text += page_text + "\n"

                else:
                    pixmap = page.get_pixmap(
                        matrix=fitz.Matrix(2, 2),
                        alpha=False
                    )

                    image = Image.open(
                        BytesIO(pixmap.tobytes("png"))
                    ).convert("L")

                    image = ImageOps.autocontrast(image)

                    page_text = pytesseract.image_to_string(
                        image,
                        config="--psm 6"
                    )

                    extracted_text += page_text + "\n"

            pdf_document.close()
            return extracted_text

        elif extension in [".png", ".jpg", ".jpeg"]:
            image = Image.open(file).convert("L")
            image = ImageOps.autocontrast(image)

            image = image.resize(
                (image.width * 2, image.height * 2)
            )

            return pytesseract.image_to_string(
                image,
                config="--psm 6"
            )

        return ""

    except Exception:
        logging.exception("Text extraction error")
        return ""


# --------------------------------------------------
# 1. UPLOAD DOCUMENT
# --------------------------------------------------

@documents_bp.route("/upload", methods=["POST"])
@jwt_required()
def upload_document():

    user = get_current_user()

    if not user:
        return jsonify({"error": "User not found"}), 404

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]

    if not file.filename:
        return jsonify({"error": "No file selected"}), 400

    filename = secure_filename(file.filename)

    if not filename:
        return jsonify({"error": "Invalid filename"}), 400

    allowed_extensions = {
        ".pdf", ".txt", ".png", ".jpg", ".jpeg"
    }

    max_file_size = 10 * 1024 * 1024
    extension = os.path.splitext(filename)[1].lower()

    if extension not in allowed_extensions:
        return jsonify({"error": "Unsupported file type"}), 400

    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)

    if file_size > max_file_size:
        return jsonify({
            "error": "File size exceeds 10 MB limit"
        }), 400

    if file_size == 0:
        return jsonify({"error": "Empty files are not allowed"}), 400

    file_content = file.read()

    try:
        if extension == ".pdf":
            if b"%PDF-" not in file_content[:1024]:
                raise ValueError()

        elif extension == ".txt":
            file_content.decode("utf-8")

        elif extension in [".png", ".jpg", ".jpeg"]:
            image = Image.open(BytesIO(file_content))

            expected_formats = {
                ".png": "PNG",
                ".jpg": "JPEG",
                ".jpeg": "JPEG"
            }

            if image.format != expected_formats[extension]:
                raise ValueError()

            image.verify()

    except Exception:
        return jsonify({
            "error": "File content does not match the selected file type"
        }), 400

    file.seek(0)

    # Store file in GridFS
    file_id = fs.put(
        file,
        filename=filename,
        content_type=file.content_type
    )

    try:
        stored_file = fs.get(file_id)

        extracted_text = extract_text(
            BytesIO(stored_file.read()),
            filename
        )

        metadata = request.form.get("metadata", "{}")

        try:
            metadata = json.loads(metadata)
        except json.JSONDecodeError:
            fs.delete(file_id)
            return jsonify({"error": "Invalid metadata JSON"}), 400

        if not isinstance(metadata, dict):
            fs.delete(file_id)
            return jsonify({
                "error": "Metadata must be a JSON object"
            }), 400

        defined_fields = {
            field["field_name"].lower(): field["field_type"]
            for field in metadata_fields_collection.find()
        }
        is_shared = False
        for field_name, value in metadata.items():

            if (
                not isinstance(field_name, str)
                or field_name.lower() not in defined_fields
            ):
                fs.delete(file_id)
                return jsonify({
                    "error": f"Metadata field '{field_name}' is not defined by admin"
                }), 400

            field_type = defined_fields[field_name.lower()]

            if field_type == "text" and not isinstance(value, str):
                fs.delete(file_id)
                return jsonify({
                    "error": f"{field_name} must be text"
                }), 400

            elif field_type == "number" and (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
            ):
                fs.delete(file_id)
                return jsonify({
                    "error": f"{field_name} must be a number"
                }), 400

            elif field_type == "date":
                try:
                    if not isinstance(value, str):
                        raise ValueError()

                    datetime.strptime(value, "%Y-%m-%d")

                except ValueError:
                    fs.delete(file_id)
                    return jsonify({
                        "error": f"{field_name} must be YYYY-MM-DD"
                    }), 400

            elif field_type == "boolean" and not isinstance(value, bool):
                fs.delete(file_id)
                return jsonify({
                    "error": f"{field_name} must be true or false"
                }), 400
             # Documents are private immediately after upload.
            # Only the owning division's admin can share them later.
        document = {
            "filename": filename,
            "file_id": file_id,
            "uploaded_by": str(user["_id"]),
            "division": user["division"],
            "content_type": file.content_type,
            "upload_date": datetime.utcnow(),
            "extracted_text": extracted_text,
            "metadata": metadata,
            "is_shared": is_shared
        }

        documents_collection.insert_one(document)

        return jsonify({
            "message": "Document uploaded successfully!",
            "filename": filename,
            "document_id": str(file_id),
            "division": user["division"],
            "is_shared": is_shared
        }), 201

    except Exception:
        logging.exception("Document upload failed")

        try:
            fs.delete(file_id)
        except Exception:
            pass

        return jsonify({
            "error": "Document upload failed. Please try again."
        }), 500


# --------------------------------------------------
# 2. VIEW ACCESSIBLE DOCUMENTS
# --------------------------------------------------
@documents_bp.route("/list", methods=["GET"])
@jwt_required()
def list_documents():

    user = get_current_user()

    if not user:
        return jsonify({"error": "User not found"}), 404

    approved_requests = access_requests_collection.find({
        "requester_id": str(user["_id"]),
        "status": "approved"
    })

    approved_ids = [
        req["document_id"] for req in approved_requests
    ]

    # Users can see their own division's documents
    # and documents for which they have approved access.
    access_filter = {
        "$or": [
            {"division": user["division"]},
            {"file_id": {"$in": approved_ids}}
        ]
    }

    filters = [access_filter]

    # Read dynamic metadata filters from query parameters.
    defined_fields = {
        field["field_name"].lower(): field
        for field in metadata_fields_collection.find()
    }

    for query_name, query_value in request.args.items():

        field = defined_fields.get(query_name.lower())

        if not field:
            return jsonify({
                "error": f"Unknown metadata filter: {query_name}"
            }), 400

        field_name = field["field_name"]
        field_type = field["field_type"]

        try:
            if field_type == "number":
                value = float(query_value)

            elif field_type == "boolean":
                if query_value.lower() not in ["true", "false"]:
                    raise ValueError()
                value = query_value.lower() == "true"

            else:
                value = query_value

        except ValueError:
            return jsonify({
                "error": f"Invalid value for {field_name}"
            }), 400

        filters.append({
            f"metadata.{field_name}": value
        })

    documents = documents_collection.find({
        "$and": filters
    })

    return jsonify({
        "documents": [
            document_response(doc) for doc in documents
        ]
    }), 200
# --------------------------------------------------
# 3. DISCOVER SHARED DOCUMENTS
# --------------------------------------------------

@documents_bp.route("/discover", methods=["GET"])
@jwt_required()
def discover_documents():

    user = get_current_user()

    if not user:
        return jsonify({"error": "User not found"}), 404

    documents = documents_collection.find({
        "division": {"$ne": user["division"]}
    })

    result = []

    for doc in documents:
        result.append({
            "document_id": str(doc["file_id"]),
            "filename": doc["filename"],
            "division": doc["division"],
            "content_type": doc.get("content_type"),
            "upload_date": (
                doc["upload_date"].isoformat()
                if doc.get("upload_date")
                else None
            ),
            "is_shared": bool(doc.get("is_shared", False)),
            "metadata": doc.get("metadata", {})
        })

    return jsonify({"documents": result}), 200

# --------------------------------------------------
# 4. SHARE / UNSHARE A DOCUMENT
# --------------------------------------------------

@documents_bp.route("/share/<document_id>", methods=["PUT"])
@jwt_required()
def update_document_sharing(document_id):

    user = get_current_user()

    if not user:
        return jsonify({"error": "User not found"}), 404

    if not ObjectId.is_valid(document_id):
        return jsonify({"error": "Invalid document ID"}), 400

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Invalid request body"}), 400

    is_shared = data.get("is_shared")

    if not isinstance(is_shared, bool):
        return jsonify({
            "error": "is_shared must be true or false"
        }), 400

    document = documents_collection.find_one({
        "file_id": ObjectId(document_id)
    })

    if not document:
        return jsonify({"error": "Document not found"}), 404

    # Only an admin of the owning division can change sharing.
    if (
        user.get("role") != "admin"
        or document["division"] != user["division"]
    ):
        return jsonify({
            "error": "Only your division's admin can change sharing"
        }), 403

    documents_collection.update_one(
        {"_id": document["_id"]},
        {"$set": {"is_shared": is_shared}}
    )

    return jsonify({
        "message": (
            "Document shared successfully"
            if is_shared
            else "Document is now private"
        ),
        "is_shared": is_shared
    }), 200


# --------------------------------------------------
# 5. DOWNLOAD / PREVIEW DOCUMENT
# --------------------------------------------------

@documents_bp.route("/download/<document_id>", methods=["GET"])
@jwt_required()
def download_document(document_id):

    user = get_current_user()

    if not user:
        return jsonify({"error": "User not found"}), 404

    if not ObjectId.is_valid(document_id):
        return jsonify({"error": "Invalid document ID"}), 400

    document = documents_collection.find_one({
        "file_id": ObjectId(document_id)
    })

    if not document or not user_can_access_document(user, document):
        return jsonify({
            "error": "Document not found or access denied"
        }), 404

    try:
        grid_file = fs.get(ObjectId(document_id))

        mimetype = (
            "application/pdf"
            if document["filename"].lower().endswith(".pdf")
            else document.get("content_type")
            or "application/octet-stream"
        )

        return send_file(
            BytesIO(grid_file.read()),
            mimetype=mimetype,
            as_attachment=False,
            download_name=document["filename"]
        )

    except Exception:
        logging.exception("Document download failed")

        return jsonify({
            "error": "Unable to download document"
        }), 404


# --------------------------------------------------
# 6. REQUEST ACCESS TO SHARED DOCUMENT
# --------------------------------------------------

@documents_bp.route("/access-request", methods=["POST"])
@jwt_required()
def request_document_access():

    user = get_current_user()

    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Request body must be a JSON object"
        }), 400

    document_id = data.get("doc_id", data.get("document_id"))
    reason = data.get("reason", "Access requested")

    # Validate document ID
    if (
        not isinstance(document_id, str)
        or not ObjectId.is_valid(document_id)
    ):
        return jsonify({
            "error": "Valid document ID is required"
        }), 400

    # Validate reason
    if not isinstance(reason, str):
        return jsonify({"error": "Reason must be text"}), 400

    reason = reason.strip()

    if not reason:
        return jsonify({"error": "Reason is required"}), 400

    if len(reason) > 500:
        return jsonify({
            "error": "Reason cannot exceed 500 characters"
        }), 400

    # Find document
    document = documents_collection.find_one({
        "file_id": ObjectId(document_id)
    })

    if not document:
        return jsonify({"error": "Document not found"}), 404

    # Prevent requests for documents in the user's own division
    if document["division"] == user["division"]:
        return jsonify({
            "error": "You already have access to this document"
        }), 400

    # Check whether access is already approved
    existing = access_requests_collection.find_one({
        "document_id": ObjectId(document_id),
        "requester_id": str(user["_id"]),
        "status": "approved"
    })

    if existing:
        return jsonify({
            "error": "You already have approved access"
        }), 409

    # Check whether a request is already pending
    existing = access_requests_collection.find_one({
        "document_id": ObjectId(document_id),
        "requester_id": str(user["_id"]),
        "status": "pending"
    })

    if existing:
        return jsonify({
            "error": "You already have a pending request"
        }), 409

    # Create access request
    access_requests_collection.insert_one({
        "document_id": ObjectId(document_id),
        "filename": document["filename"],
        "requester_id": str(user["_id"]),
        "requester_division": user["division"],
        "owner_division": document["division"],
        "reason": reason,
        "status": "pending",
        "created_at": datetime.utcnow()
    })

    return jsonify({
        "message": "Access request submitted successfully",
        "status": "pending"
    }), 201

# --------------------------------------------------
# 7. MY ACCESS REQUESTS
# --------------------------------------------------

@documents_bp.route("/my-access-requests", methods=["GET"])
@jwt_required()
def my_access_requests():

    user = get_current_user()

    if not user:
        return jsonify({"error": "User not found"}), 404

    requests_list = []

    requests_cursor = access_requests_collection.find({
        "requester_id": str(user["_id"])
    }).sort("created_at", -1)

    for req in requests_cursor:
        requests_list.append({
            "request_id": str(req["_id"]),
            "document_id": str(req["document_id"]),
            "filename": req.get("filename", "Unknown"),
            "requester_division": req.get("requester_division"),
            "owner_division": req.get("owner_division"),
            "reason": req.get("reason", ""),
            "status": req.get("status", "pending"),
            "created_at": (
                req["created_at"].isoformat()
                if req.get("created_at")
                else None
            )
        })

    return jsonify({
        "my_requests": requests_list
    }), 200


# --------------------------------------------------
# 8. ADMIN ACCESS REQUEST INBOX
# --------------------------------------------------

@documents_bp.route("/access-requests", methods=["GET"])
@jwt_required()
def view_access_requests():

    user = get_current_user()

    if not user:
        return jsonify({"error": "User not found"}), 404

    requests_cursor = access_requests_collection.find({
        "owner_division": user["division"]
    }).sort("created_at", -1)

    requests_list = []

    for req in requests_cursor:
        requests_list.append({
            "request_id": str(req["_id"]),
            "document_id": str(req["document_id"]),
            "filename": req.get("filename", "Unknown"),
            "requester_id": req.get("requester_id"),
            "requester_division": req.get("requester_division"),
            "owner_division": req.get("owner_division"),
            "reason": req.get("reason", ""),
            "status": req.get("status", "pending"),
            "created_at": (
                req["created_at"].isoformat()
                if req.get("created_at")
                else None
            )
        })

    return jsonify({
        "access_requests": requests_list
    }), 200


# --------------------------------------------------
# 9. ADMIN APPROVES OR REJECTS REQUEST
# --------------------------------------------------

@documents_bp.route("/access-request/<request_id>", methods=["PUT"])
@jwt_required()
def update_access_request(request_id):

    user = get_current_user()

    if not user:
        return jsonify({"error": "User not found"}), 404

    if not ObjectId.is_valid(request_id):
        return jsonify({"error": "Invalid request ID"}), 400

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Request body must be a JSON object"
        }), 400

    status = data.get("status", "approved")

    if not isinstance(status, str):
        return jsonify({"error": "Status must be text"}), 400

    status = status.strip().lower()

    if status not in ["approved", "rejected"]:
        return jsonify({
            "error": "Status must be approved or rejected"
        }), 400

    access_request = access_requests_collection.find_one({
        "_id": ObjectId(request_id)
    })

    if not access_request:
        return jsonify({
            "error": "Access request not found"
        }), 404

    # An admin can only process requests for their own division.
    if access_request.get("owner_division") != user["division"]:
        return jsonify({
            "error": "You cannot process another division's requests"
        }), 403

    if access_request.get("status") != "pending":
        return jsonify({
            "error": "This request has already been processed"
        }), 409

    result = access_requests_collection.update_one(
        {
            "_id": ObjectId(request_id),
            "owner_division": user["division"],
            "status": "pending"
        },
        {
            "$set": {
                "status": status,
                "reviewed_by": str(user["_id"]),
                "reviewed_at": datetime.utcnow()
            }
        }
    )

    if result.modified_count == 0:
        return jsonify({
            "error": "This request has already been processed"
        }), 409

    return jsonify({
        "message": f"Access request {status} successfully",
        "status": status
    }), 200


# --------------------------------------------------
# 10. SEARCH ACCESSIBLE DOCUMENTS
# --------------------------------------------------


@documents_bp.route("/search", methods=["GET"])
@jwt_required()
def search_documents():

    user = get_current_user()

    if not user:
        return jsonify({"error": "User not found"}), 404

    search_term = request.args.get("q", "").strip()
    division_filter = request.args.get("division", "").strip()
    report_type_filter = request.args.get("report_type", "").strip()

    if not search_term:
        return jsonify({"error": "Search term is required"}), 400

    if len(search_term) > 100:
        return jsonify({
            "error": "Search term cannot exceed 100 characters"
        }), 400

    if len(division_filter) > 100 or len(report_type_filter) > 100:
        return jsonify({
            "error": "Filter value is too long"
        }), 400

    search_pattern = re.escape(search_term)

    approved_requests = access_requests_collection.find({
        "requester_id": str(user["_id"]),
        "status": "approved"
    })

    approved_ids = [
        req["document_id"] for req in approved_requests
    ]

    access_filter = {
        "$or": [
            {"division": user["division"]},
            {"file_id": {"$in": approved_ids}}
        ]
    }

    search_clause = {
        "$or": [
            {
                "filename": {
                    "$regex": search_pattern,
                    "$options": "i"
                }
            },
            {
                "extracted_text": {
                    "$regex": search_pattern,
                    "$options": "i"
                }
            },
            {
                "$expr": {
                    "$anyElementTrue": {
                        "$map": {
                            "input": {
                                "$objectToArray": {
                                    "$ifNull": ["$metadata", {}]
                                }
                            },
                            "as": "item",
                            "in": {
                                "$regexMatch": {
                                    "input": {
                                        "$toString": "$$item.v"
                                    },
                                    "regex": search_pattern,
                                    "options": "i"
                                }
                            }
                        }
                    }
                }
            }
        ]
    }

    filters = [access_filter, search_clause]

    if division_filter:
        filters.append({
            "division": division_filter
        })

    if report_type_filter:
        filters.append({
            "metadata.Report Type": report_type_filter
        })

    documents = documents_collection.find({
        "$and": filters
    })

    results = []

    for doc in documents:
        results.append({
            "document_id": str(doc["file_id"]),
            "filename": doc["filename"],
            "division": doc["division"],
            "metadata": doc.get("metadata", {})
        })

    return jsonify({
        "search_results": results
    }), 200
