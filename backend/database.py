
import os
import certifi
from dotenv import load_dotenv
from pymongo import MongoClient
from gridfs import GridFS

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")

if not MONGO_URI:
    raise ValueError("MONGO_URI is missing from .env file")

try:
    client = MongoClient(
        MONGO_URI,
        tlsCAFile=certifi.where(),
        serverSelectionTimeoutMS=15000,
        connectTimeoutMS=15000
    )

    # Actually test the database connection
    client.admin.command("ping")

    print("MongoDB Connected Successfully!")

    db = client["triad_dms"]

    # Collections
    users_collection = db["users"]
    documents_collection = db["documents"]
    access_requests_collection = db["access_requests"]
    metadata_fields_collection = db["metadata_fields"]

    # GridFS for document storage
    fs = GridFS(db)

    print("All database collections initialized!")
    print("GridFS initialized!")

except Exception as e:
    print("MongoDB Connection Failed:", str(e))
    raise
