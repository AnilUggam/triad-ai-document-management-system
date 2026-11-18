
import re
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson import ObjectId
from datetime import datetime

from database import (
    users_collection,
    metadata_fields_collection,
    documents_collection
)

metadata_bp = Blueprint("metadata", __name__)

ALLOWED_TYPES = ["text", "number", "date", "boolean"]


# --------------------------------------------------
# HELPERS
# --------------------------------------------------

def get_admin_user():

    user_id = get_jwt_identity()

    if not ObjectId.is_valid(user_id):
        return None, (jsonify({"error": "Invalid user"}), 401)

    user = users_collection.find_one({
        "_id": ObjectId(user_id)
    })

    if not user:
        return None, (jsonify({"error": "User not found"}), 404)

    if user.get("role") not in ("admin", "system_admin"):
        return None, (jsonify({"error": "Admin access required"}), 403)

    return user, None


def validate_field_name(field_name):

    if not isinstance(field_name, str):
        return False

    field_name = field_name.strip()

    if not field_name or len(field_name) > 50:
        return False

    return field_name.replace("_", "").replace(" ", "").isalnum()


def validate_metadata_value(value, field_type):

    if field_type == "text":
        return isinstance(value, str)

    if field_type == "number":
        return (
            isinstance(value, (int, float))
            and not isinstance(value, bool)
        )

    if field_type == "boolean":
        return isinstance(value, bool)

    if field_type == "date":
        if not isinstance(value, str):
            return False

        try:
            datetime.strptime(value, "%Y-%m-%d")
            return True
        except ValueError:
            return False

    return False


# --------------------------------------------------
# CREATE METADATA FIELD
# --------------------------------------------------

@metadata_bp.route("/fields", methods=["POST"])
@jwt_required()
def create_metadata_field():

    user, error = get_admin_user()

    if error:
        return error

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Request body must be a valid JSON object"
        }), 400

    field_name = data.get("field_name")
    field_type = data.get("field_type")

    if not validate_field_name(field_name):
        return jsonify({
            "error": "Invalid field name. Use up to 50 letters, numbers, spaces or underscores."
        }), 400

    field_name = field_name.strip()

    if not isinstance(field_type, str):
        return jsonify({"error": "Field type must be text"}), 400

    field_type = field_type.strip().lower()

    if field_type not in ALLOWED_TYPES:
        return jsonify({
            "error": "Invalid field type",
            "allowed_types": ALLOWED_TYPES
        }), 400

    existing = metadata_fields_collection.find_one({
        "field_name": {
            "$regex": f"^{re.escape(field_name)}$",
            "$options": "i"
        }
    })

    if existing:
        return jsonify({"error": "Field already exists"}), 409

    metadata_fields_collection.insert_one({
        "field_name": field_name,
        "field_type": field_type,
        "created_by": str(user["_id"]),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    })

    return jsonify({
        "message": "Metadata field created successfully",
        "field_name": field_name,
        "field_type": field_type
    }), 201


# --------------------------------------------------
# VIEW METADATA FIELDS
# --------------------------------------------------

@metadata_bp.route("/fields", methods=["GET"])
@jwt_required()
def get_metadata_fields():

    fields = metadata_fields_collection.find().sort(
        "created_at", 1
    )

    result = []

    for field in fields:
        result.append({
            "field_id": str(field["_id"]),
            "field_name": field["field_name"],
            "field_type": field["field_type"]
        })

    return jsonify({
        "metadata_fields": result
    }), 200


# --------------------------------------------------
# EDIT METADATA FIELD
# --------------------------------------------------

@metadata_bp.route("/fields/<field_id>", methods=["PUT"])
@jwt_required()
def update_metadata_field(field_id):

    user, error = get_admin_user()

    if error:
        return error

    if not ObjectId.is_valid(field_id):
        return jsonify({"error": "Invalid field ID"}), 400

    field = metadata_fields_collection.find_one({
        "_id": ObjectId(field_id)
    })

    if not field:
        return jsonify({"error": "Metadata field not found"}), 404

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Request body must be a JSON object"
        }), 400

    new_name = data.get("field_name", field["field_name"])
    new_type = data.get("field_type", field["field_type"])

    if not validate_field_name(new_name):
        return jsonify({"error": "Invalid field name"}), 400

    new_name = new_name.strip()

    if not isinstance(new_type, str):
        return jsonify({"error": "Field type must be text"}), 400

    new_type = new_type.strip().lower()

    if new_type not in ALLOWED_TYPES:
        return jsonify({
            "error": "Invalid field type",
            "allowed_types": ALLOWED_TYPES
        }), 400

    duplicate = metadata_fields_collection.find_one({
        "_id": {"$ne": ObjectId(field_id)},
        "field_name": {
            "$regex": f"^{re.escape(new_name)}$",
            "$options": "i"
        }
    })

    if duplicate:
        return jsonify({
            "error": "Another metadata field already uses this name"
        }), 409

    old_name = field["field_name"]
    old_type = field["field_type"]

    # Validate existing document values before changing the type.
    existing_documents = documents_collection.find({
        f"metadata.{old_name}": {"$exists": True}
    })

    for document in existing_documents:

        value = document.get("metadata", {}).get(old_name)

        if not validate_metadata_value(value, new_type):
            return jsonify({
                "error": (
                    f"Cannot change field type to {new_type}. "
                    "Some existing documents contain incompatible values."
                )
            }), 400

    # Rename the metadata key in existing documents.
    if old_name != new_name:
        documents_collection.update_many(
            {f"metadata.{old_name}": {"$exists": True}},
            {
                "$rename": {
                    f"metadata.{old_name}": f"metadata.{new_name}"
                }
            }
        )

    metadata_fields_collection.update_one(
        {"_id": ObjectId(field_id)},
        {
            "$set": {
                "field_name": new_name,
                "field_type": new_type,
                "updated_by": str(user["_id"]),
                "updated_at": datetime.utcnow()
            }
        }
    )

    return jsonify({
        "message": "Metadata field updated successfully",
        "field_name": new_name,
        "field_type": new_type
    }), 200
