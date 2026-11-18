# TRIAD AI – Document Management System (DMS)

A full-stack Document Management System built using Python, Flask, MongoDB, and JavaScript. The application provides secure document storage, dynamic metadata management, role-based access control, cross-division document sharing, and OCR-powered full-text search.

## Features

- **User Authentication:** Secure registration and login using JWT authentication.
- **Role-Based Access Control:** Separate admin and normal-user permissions.
- **Division Isolation:** Users can access documents belonging to their own division by default.
- **Document Upload:** Upload PDF, TXT, PNG, JPG, and JPEG files.
- **Dynamic Metadata:** Admins can create and edit custom metadata fields without hardcoding them.
- **Cross-Division Discovery:** Discover documents belonging to other divisions.
- **Access Requests:** Users can request access to private documents from other divisions.
- **Access Approval:** Members of the document-owning division can approve or reject access requests.
- **OCR Integration:** Extract text from scanned PDFs and images.
- **Advanced Search:** Search document filenames, metadata, and extracted OCR text.
- **Document Preview and Download:** Preview and download documents when authorized.
- **Metadata Filtering:** Filter documents using dynamically configured metadata fields.

## Technology Stack

### Backend
- Python
- Flask
- Flask-JWT-Extended
- MongoDB
- GridFS
- PyMuPDF
- Tesseract OCR
- Pillow
- Pytesseract

### Frontend
- HTML5
- CSS3
- JavaScript

## Project Structure

```text
triad-ai-document-management-system/
│
├── backend/
│   ├── app.py
│   ├── auth.py
│   ├── cleanup_documents.py
│   ├── database.py
│   ├── documents.py
│   ├── metadata.py
│   └── requirements.txt
│
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
│
├── .gitignore
└── README.md
```

## Prerequisites

Install the following before running the application:

- Python 3.10 or later
- MongoDB
- Tesseract OCR
- A modern web browser
- Git

## Installation and Setup

### 1. Clone the Repository

```bash
git clone https://github.com/AnilUggam/triad-ai-document-management-system.git
cd triad-ai-document-management-system
```

### 2. Set Up the Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create a `.env` file inside the `backend` folder.

Configure the required environment variables according to the backend configuration.

Example:

```env
MONGO_URI=mongodb://localhost:27017/triad_dms
SECRET_KEY=replace_with_a_secure_random_secret
JWT_SECRET_KEY=replace_with_another_secure_random_secret
```

Use a strong secret key in your actual environment. Never commit real passwords, database credentials, or secret keys to GitHub.

### 4. Install Tesseract OCR

Install Tesseract OCR on your system.

On Windows, the typical installation path is:

```text
C:\Program Files\Tesseract-OCR\tesseract.exe
```

Ensure the executable is available to the backend through its configured path or system PATH.

### 5. Start the Backend

From the backend folder, run:

```powershell
python app.py
```

Backend URL:

```text
http://127.0.0.1:5000
```

### 6. Start the Frontend

Open a second terminal:

```powershell
cd frontend
python -m http.server 5500
```

Open the application in your browser:

```text
http://127.0.0.1:5500/
```

## API Endpoints

All endpoints below use the `/api` prefix.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a user |
| POST | `/api/auth/login` | Authenticate a user |
| POST | `/api/documents/upload` | Upload a document |
| GET | `/api/documents/list` | Retrieve accessible documents |
| GET | `/api/documents/discover` | Discover documents from other divisions |
| GET | `/api/documents/download/<document_id>` | Preview or download an authorized document |
| POST | `/api/documents/access-request` | Request access to a document |
| GET | `/api/documents/my-access-requests` | View your submitted requests |
| GET | `/api/documents/access-requests` | View requests owned by your division |
| PUT | `/api/documents/access-request/<request_id>` | Approve or reject an access request |
| PUT | `/api/documents/share/<document_id>` | Change document-sharing status |
| GET | `/api/documents/search` | Search accessible documents |
| GET | `/api/metadata/fields` | Retrieve metadata field definitions |
| POST | `/api/metadata/fields` | Create a metadata field |
| PUT | `/api/metadata/fields/<field_id>` | Edit a metadata field |

## Security

- JWT-based authentication.
- Secure password hashing.
- Server-side role-based authorization.
- Division-level document access restrictions.
- Approval-based cross-division access.
- Individual-user access permissions for approved documents.
- Admin-only metadata management and sharing controls.
- Server-side file and metadata validation.
- Private-by-default document uploads.

## Testing

The following functionality has been manually tested:

- User registration and login.
- Authentication and authorization.
- Document upload and download.
- PDF and image OCR.
- Full-text and metadata search.
- Dynamic metadata creation, editing, and filtering.
- Division-based document isolation.
- Cross-division access requests and approvals.
- Individual-user access permissions.
- Unauthorized access restrictions.
- File upload validation.
- Normal-user and admin permission restrictions.

## Future Improvements

- Docker-based deployment.
- Automated backend test suite.
- Audit logs for document access.
- Improved document version management.
- Cloud deployment.

## Author

Developed as part of the TRIAD AI Full Stack Developer Internship Take-Home Assignment.