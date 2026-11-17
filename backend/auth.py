
import re

from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token

from database import users_collection

auth_bp = Blueprint("auth", __name__)


# USER REGISTRATION
@auth_bp.route("/register", methods=["POST"])
def register():

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Valid JSON data required"}), 400

    username = data.get("username", "")
    email = data.get("email", "")
    password = data.get("password", "")
    division = data.get("division", "")

    if not all(isinstance(value, str) for value in [
        username, email, password, division
    ]):
        return jsonify({"error": "All fields must be valid strings"}), 400

    username = username.strip()
    email = email.strip().lower()
    division = division.strip()

    if not all([username, email, password, division]):
        return jsonify({"error": "All fields are required"}), 400

    if len(username) > 50:
        return jsonify({"error": "Username must not exceed 50 characters"}), 400

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return jsonify({"error": "Invalid email address"}), 400

    if len(email) > 254:
        return jsonify({"error": "Email address is too long"}), 400

    if len(password) < 8:
        return jsonify({
            "error": "Password must be at least 8 characters"
        }), 400

    if len(password) > 128:
        return jsonify({"error": "Password is too long"}), 400

    if len(division) > 100:
        return jsonify({"error": "Division name is too long"}), 400

    if users_collection.find_one({"email": email}):
        return jsonify({"error": "Email already registered"}), 409

    hashed_password = generate_password_hash(password)

    user = {
        "username": username,
        "email": email,
        "password": hashed_password,
        "division": division,
        "role": "user"
    }

    result = users_collection.insert_one(user)

    return jsonify({
        "message": "Registration successful",
        "user_id": str(result.inserted_id)
    }), 201


# USER LOGIN
@auth_bp.route("/login", methods=["POST"])
def login():

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Valid JSON data required"}), 400

    email = data.get("email", "")
    password = data.get("password", "")

    if not isinstance(email, str) or not isinstance(password, str):
        return jsonify({"error": "Email and password must be strings"}), 400

    email = email.strip().lower()

    if not email or not password:
        return jsonify({
            "error": "Email and password required"
        }), 400

    user = users_collection.find_one({"email": email})

    if not user or not check_password_hash(user["password"], password):
        return jsonify({
            "error": "Invalid email or password"
        }), 401

    token = create_access_token(identity=str(user["_id"]))

    return jsonify({
        "message": "Login successful",
        "access_token": token,
        "token": token,
        "user": {
            "id": str(user["_id"]),
            "username": user["username"],
            "email": user["email"],
            "division": user["division"],
            "role": user["role"]
        }
    }), 200
