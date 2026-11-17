# TRIAD AI – Document Management System (DMS)

A full-stack Document Management System built using Python, Flask, MongoDB, and JavaScript. The application provides secure document storage, dynamic metadata management, role-based access control, cross-division document sharing, and OCR-powered full-text search.

## Features

- **User Authentication:** Secure registration and login using JWT authentication.
- **Role-Based Access Control:** Admin and normal-user permissions.
- **Division Isolation:** Users can access documents belonging to their own division by default.
- **Document Upload:** Upload PDF, TXT, PNG, JPG, and JPEG files.
- **Dynamic Metadata:** Admins can create and edit custom metadata fields without hardcoding them.
- **Cross-Division Sharing:** Users can request access to documents shared by other divisions.
- **Access Approval:** Admins of the owning division can approve or reject access requests.
- **OCR Integration:** Extract text from scanned PDFs and images.
- **Advanced Search:** Search document filenames, metadata, and extracted OCR text.
- **Document Preview and Download:** Authorized users can preview and download documents.
- **Metadata Filtering:** Filter documents using dynamically configured fields.

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
triad-dms/
│
├── backend/
│   ├── app.py
│   ├── auth.py
│   ├── database.py
│   ├── documents.py
│   ├── metadata.py
│   ├── requirements.txt
│   └── .env
│
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
│
└── README.md
```

## Prerequisites

Install the following before running the application:

- Python 3.10 or later
- MongoDB
- Tesseract OCR
- A modern web browser

## Installation and Setup

### 1. Clone the Repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd triad-dms
```

### 2. Set Up the Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create a `.env` file inside the backend folder.

Configure the required MongoDB connection string and JWT secret according to your backend configuration.

Example:

```env
MONGO_URI=mongodb://localhost:27017/triad_dms
JWT_SECRET_KEY=replace_with_a_secure_random_secret
```

Do not commit real passwords, database credentials, or secret keys to GitHub.

### 4. Install Tesseract OCR

Install Tesseract OCR and configure its executable path in the backend if required.

Example Windows path:

```text
C:\Program Files\Tesseract-OCR\tesseract.exe
```

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

Open another terminal:

```powershell
cd frontend
python -m http.server 5500
```

Open the application in your browser:

```text
http://127.0.0.1:5500
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a user |
| POST | `/api/auth/login` | Authenticate a user |
| POST | `/api/documents/upload` | Upload a document |
| GET | `/api/documents` | Retrieve accessible documents |
| GET | `/api/documents/<doc_id>/download` | Preview or download a document |
| POST | `/api/access/request` | Request document access |
| POST | `/api/access/approve` | Approve an access request |
| GET | `/api/search?q=<query>` | Search documents |
| GET | `/api/metadata/fields` | Retrieve metadata field definitions |
| POST | `/api/metadata/fields` | Create a metadata field |
| PUT | `/api/metadata/fields/<field_id>` | Edit a metadata field |

## Security

- JWT-based authentication.
- Password hashing.
- Role-based administrative permissions.
- Division-level document access restrictions.
- Approval-based cross-division access.
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
- Unauthorized access restrictions.
- File upload validation.

## Future Improvements

- Docker-based deployment.
- Automated backend test suite.
- Audit logs for document access.
- Improved document version management.
- Cloud deployment.

## Author

Developed as part of the TRIAD AI Full Stack Developer Internship Take-Home Assignment.