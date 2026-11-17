
from database import documents_collection, fs

# Exact GridFS IDs of the three files to preserve
KEEP_IDS = {
    "6afaa51ecb1e57707d0aa495",  # Application_form_HCLTFP2465112.pdf
    "6afaadd5c05c431ec313bc06",  # quote_test.png
    "6af981df53d8633b3972773d",  # test.txt
}

documents = list(documents_collection.find({}))

to_delete = [
    doc for doc in documents
    if str(doc.get("file_id")) not in KEEP_IDS
]

print("\nFiles that will be deleted:")
for doc in to_delete:
    print("-", doc.get("filename"), doc.get("file_id"))

print("\nFiles being preserved:")
for doc in documents:
    if str(doc.get("file_id")) in KEEP_IDS:
        print("-", doc.get("filename"))

confirm = input("\nType DELETE to confirm cleanup: ")

if confirm == "DELETE":
    deleted = 0

    for doc in to_delete:
        file_id = doc["file_id"]

        fs.delete(file_id)
        documents_collection.delete_one({"_id": doc["_id"]})

        deleted += 1

    print(f"\nCleanup complete! {deleted} files deleted.")
    print("3 selected files preserved.")
else:
    print("\nCleanup cancelled. No files deleted.")
