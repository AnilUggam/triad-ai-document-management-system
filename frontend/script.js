/* ==========================================================
   TRIAD AI — DOCUMENT INTELLIGENCE WORKSPACE
   UPDATED SCRIPT — PART 1
   ========================================================== */

const API_URL = "http://127.0.0.1:5000/api";

let currentUser = null;
let allDocuments = [];
let currentSearchResults = [];
let discoveredDocuments = [];
let activeTypeFilter = "all";
let currentViewerURL = null;
let currentViewerDocument = null;

let metadataFields = [];
let activeMetadataFilters = {};


/* ==========================================================
   COMMON HELPERS
   ========================================================== */

function getToken() {
    return localStorage.getItem("token") ||
           localStorage.getItem("access_token");
}

function getCurrentUser() {
    try {
        return JSON.parse(localStorage.getItem("user"));
    } catch {
        return null;
    }
}

async function apiRequest(endpoint, options = {}) {
    const headers = { ...(options.headers || {}) };
    const token = getToken();

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers
    });

    let data = {};

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        throw new Error(
            data.error || data.message ||
            `Request failed (${response.status})`
        );
    }

    return data;
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function showMessage(
    message,
    type = "success",
    target = "dashboardMessage"
) {
    const element = document.getElementById(target);

    if (!element) {
        alert(message);
        return;
    }

    element.textContent = message;
    element.className = `message ${type}`;
    element.style.display = "block";

    if (target === "dashboardMessage") {
        setTimeout(() => {
            element.style.display = "none";
        }, 5000);
    }
}

function formatDate(dateValue) {
    if (!dateValue) return "Date unavailable";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return "Date unavailable";
    }

    return date.toLocaleDateString();
}

function getFileExtension(filename = "") {
    return filename.split(".").pop().toLowerCase();
}

function getFileType(filename = "") {
    const extension = getFileExtension(filename);

    if (extension === "pdf") return "PDF";
    if (extension === "txt") return "TXT";
    if (["png", "jpg", "jpeg"].includes(extension)) return "IMG";

    return "FILE";
}

function getDocumentId(doc) {
    return doc.document_id || doc.id || "";
}

function getFavoriteKey() {
    const userId =
        currentUser?._id ||
        currentUser?.id ||
        currentUser?.email ||
        "user";

    return `triad_favorites_${userId}`;
}

function getFavorites() {
    try {
        return JSON.parse(localStorage.getItem(getFavoriteKey())) || [];
    } catch {
        return [];
    }
}

function saveFavorites(favorites) {
    localStorage.setItem(
        getFavoriteKey(),
        JSON.stringify(favorites)
    );

    updateStatistics();
}


/* ==========================================================
   AUTHENTICATION
   ========================================================== */

function showLogin() {
    document.getElementById("loginForm").classList.remove("hidden");
    document.getElementById("registerForm").classList.add("hidden");

    document.getElementById("loginTab").classList.add("active");
    document.getElementById("registerTab").classList.remove("active");

    document.getElementById("authTitle").textContent =
        "Welcome back";

    document.getElementById("authSubtitle").textContent =
        "Sign in to access your division's document workspace.";

    const message = document.getElementById("message");

    message.textContent = "";
    message.style.display = "none";
}

function showRegister() {
    document.getElementById("registerForm").classList.remove("hidden");
    document.getElementById("loginForm").classList.add("hidden");

    document.getElementById("registerTab").classList.add("active");
    document.getElementById("loginTab").classList.remove("active");

    document.getElementById("authTitle").textContent =
        "Create your account";

    document.getElementById("authSubtitle").textContent =
        "Join your division's document workspace.";

    const message = document.getElementById("message");

    message.textContent = "";
    message.style.display = "none";
}

document.getElementById("registerForm").addEventListener(
    "submit",
    async event => {
        event.preventDefault();

        const button = event.currentTarget.querySelector(
            'button[type="submit"]'
        );

        button.disabled = true;

        const userData = {
            username: document.getElementById("registerUsername").value.trim(),
            email: document.getElementById("registerEmail").value.trim(),
            password: document.getElementById("registerPassword").value,
            division: document.getElementById("registerDivision").value
        };

        try {
            const data = await apiRequest("/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(userData)
            });

            showMessage(
                data.message || "Account created successfully. Please sign in.",
                "success",
                "message"
            );

            document.getElementById("registerForm").reset();
            showLogin();

        } catch (error) {
            showMessage(error.message, "error", "message");
        } finally {
            button.disabled = false;
        }
    }
);

document.getElementById("loginForm").addEventListener(
    "submit",
    async event => {
        event.preventDefault();

        const button = event.currentTarget.querySelector(
            'button[type="submit"]'
        );

        button.disabled = true;

        const credentials = {
            email: document.getElementById("loginEmail").value.trim(),
            password: document.getElementById("loginPassword").value
        };

        try {
            const data = await apiRequest("/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(credentials)
            });

            const token = data.access_token || data.token;

            if (!token || !data.user) {
                throw new Error(
                    "Login response is missing user or access token."
                );
            }

            localStorage.setItem("token", token);
            localStorage.setItem("access_token", token);
            localStorage.setItem("user", JSON.stringify(data.user));

            currentUser = data.user;

            await openApplication();

        } catch (error) {
            showMessage(
                error.message.includes("Failed to fetch")
                    ? "Cannot connect to the backend. Please start the Flask server."
                    : error.message,
                "error",
                "message"
            );
        } finally {
            button.disabled = false;
        }
    }
);

async function openApplication() {
    currentUser = getCurrentUser();

    if (!currentUser) {
        logout();
        return;
    }

    document.getElementById("authScreen").classList.add("hidden");
    document.getElementById("appScreen").classList.remove("hidden");

    const username =
        currentUser.username || currentUser.name || "User";

    const division = currentUser.division || "No Division";

    document.getElementById("welcomeUser").textContent = username;
    document.getElementById("topUserName").textContent = username;
    document.getElementById("topUserDivision").textContent = division;
    document.getElementById("userAvatar").textContent =
        username.charAt(0).toUpperCase();

    document.getElementById("divisionStat").textContent = division;

    buildAccessNavigation();
    buildMetadataNavigation();

    await loadMetadataFields();
    await loadDocuments();

    loadMyAccessRequests();

    if (currentUser.role === "admin") {
        loadAccessInbox();
    }

    navigateTo("homeView");
}

function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");

    currentUser = null;
    allDocuments = [];
    currentSearchResults = [];
    metadataFields = [];

    document.getElementById("appScreen").classList.add("hidden");
    document.getElementById("authScreen").classList.remove("hidden");

    closeViewer();
    showLogin();
}


/* ==========================================================
   NAVIGATION
   ========================================================== */

const VIEW_TITLES = {
    homeView: "Dashboard Overview",
    documentsView: "All Documents",
    favoritesView: "Favorite Documents",
    uploadView: "Upload Document",
    discoverView: "Other Divisions' Documents",
    myRequestsView: "My Access Requests",
    accessInboxView: "Access Request Inbox",
    metadataView: "Metadata Settings"
};

function navigateTo(viewId, clickedButton = null) {

    // Protect Metadata Settings from normal users
    if (viewId === "metadataView" && currentUser?.role !== "admin") {
        showMessage("Admin access required", "error");
        viewId = "homeView";
        clickedButton = null;
    }

    document.querySelectorAll(".content-view").forEach(view => {
        view.classList.add("hidden");
    });

    const target = document.getElementById(viewId);

    if (!target) {
        console.error(`View not found: ${viewId}`);
        return;
    }

    target.classList.remove("hidden");

    document.getElementById("topbarTitle").textContent =
        VIEW_TITLES[viewId] || "TRIAD AI";

    document.querySelectorAll(".nav-item[data-view]").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.view === viewId
        );
    });

    if (clickedButton) {
        clickedButton.classList.add("active");
    }

    if (viewId === "documentsView") {
        loadDocuments();
    }

    if (viewId === "favoritesView") {
        renderFavorites();
    }

    if (viewId === "discoverView") {
        loadDiscoveredDocuments();
    }

    if (viewId === "myRequestsView") {
        loadMyAccessRequests();
    }

    if (viewId === "accessInboxView" && currentUser) {
    loadAccessInbox();
    }

    if (viewId === "metadataView" &&
        currentUser?.role === "admin") {
        loadMetadataSettings();
    }

    document.getElementById("sidebar")
        ?.classList.remove("sidebar-open");

    document.getElementById("sidebarBackdrop")
        ?.classList.remove("show");
}

function toggleSidebar() {
    document.getElementById("sidebar")
        ?.classList.toggle("sidebar-open");

    document.getElementById("sidebarBackdrop")
        ?.classList.toggle("show");
}


/* ==========================================================
   ACCESS WORKFLOW NAVIGATION
   ========================================================== */

function buildAccessNavigation() {
    const navigation = document.querySelector(".navigation");

    if (!navigation) return;

    document.getElementById("accessNavigationGroup")?.remove();

    const group = document.createElement("div");
    group.id = "accessNavigationGroup";

    group.innerHTML = `
        <div class="sidebar-label">DOCUMENT SHARING</div>

        <button class="nav-item" data-view="discoverView"
            onclick="navigateTo('discoverView', this)">
            <span>🌐</span>
            <span>Other Divisions' Documents</span>
        </button>

        <button class="nav-item" data-view="myRequestsView"
            onclick="navigateTo('myRequestsView', this)">
            <span>📨</span>
            <span>My Access Requests</span>
        </button>

        ${currentUser ? `
            <button class="nav-item" data-view="accessInboxView"
                onclick="navigateTo('accessInboxView', this)">
                <span>📥</span>
                <span>Access Request Inbox</span>
            </button>
        ` : ""}
    `;

    navigation.appendChild(group);
}


/* ==========================================================
   DYNAMIC METADATA — LOAD FIELD DEFINITIONS
   ========================================================== */

async function loadMetadataFields() {
    try {
        const data = await apiRequest("/metadata/fields");

        metadataFields = Array.isArray(data.metadata_fields)
            ? data.metadata_fields
            : [];

        renderMetadataFilters();
        renderUploadMetadataFields();
        renderMetadataSettingsList();
        renderAdvancedSearchFilters();

    } catch (error) {
        console.error("Unable to load metadata fields:", error);

        showMessage(
            `Unable to load metadata fields: ${error.message}`,
            "error"
        );
    }
}

/* ==========================================================
   DYNAMIC METADATA FILTERS
   ========================================================== */

function ensureMetadataFilterContainer() {
    const searchInput = document.getElementById("searchInput");

    if (!searchInput) return null;

    const toolbar = searchInput.closest(".toolbar");

    if (!toolbar) return null;

    let container = document.getElementById("metadataFilters");

    if (!container) {
        container = document.createElement("div");
        container.id = "metadataFilters";
        container.className = "metadata-filters";

        toolbar.insertAdjacentElement("afterend", container);
    }

    return container;
}

function renderMetadataFilters() {
    const container = ensureMetadataFilterContainer();

    if (!container) return;

    container.innerHTML = "";

    if (!metadataFields.length) {
        return;
    }

    const heading = document.createElement("div");
    heading.className = "metadata-filter-heading";
    heading.textContent = "Filter by metadata";

    container.appendChild(heading);

    const controls = document.createElement("div");
    controls.className = "metadata-filter-controls";

    metadataFields.forEach(field => {
        const wrapper = document.createElement("label");
        wrapper.className = "metadata-filter-item";

        const label = document.createElement("span");
        label.textContent = field.field_name;

        let input;

        if (field.field_type === "boolean") {
            input = document.createElement("select");
            input.innerHTML = `
                <option value="">All</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
            `;
        } else {
            input = document.createElement("input");
            input.type =
                field.field_type === "number" ||
                field.field_type === "date"
                    ? field.field_type
                    : "text";

            input.placeholder = `Filter ${field.field_name}`;
        }

        input.dataset.metadataField = field.field_name;

        input.addEventListener("change", () => {
            const value = input.value.trim();

            if (value) {
                activeMetadataFilters[field.field_name] = value;
            } else {
                delete activeMetadataFilters[field.field_name];
            }

            loadDocuments();
        });

        if (input.tagName === "INPUT" && input.type === "text") {
            input.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    input.dispatchEvent(new Event("change"));
                }
            });
        }

        wrapper.appendChild(label);
        wrapper.appendChild(input);
        controls.appendChild(wrapper);
    });

    container.appendChild(controls);

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "secondary-btn compact-btn";
    clearButton.textContent = "Clear metadata filters";

    clearButton.addEventListener("click", () => {
        activeMetadataFilters = {};
        renderMetadataFilters();
        loadDocuments();
    });

    container.appendChild(clearButton);
}

function buildMetadataNavigation() {
    const item = document.getElementById("metadataNavItem");

    if (!item) {
        console.error("metadataNavItem was not found in index.html");
        return;
    }

    item.classList.toggle("hidden", currentUser?.role !== "admin");
}
/* ==========================================================
   DASHBOARD AND DOCUMENT LIST
   ========================================================== */

function buildDocumentListURL() {
    const params = new URLSearchParams();

    Object.entries(activeMetadataFilters).forEach(([name, value]) => {
        if (value !== "") {
            params.set(name, value);
        }
    });

    const queryString = params.toString();

    return queryString
        ? `/documents/list?${queryString}`
        : "/documents/list";
}

async function loadDocuments() {
    try {
        const data = await apiRequest(buildDocumentListURL());

        allDocuments = data.documents || [];

        // Refresh Advanced Search dropdowns
        renderAdvancedSearchFilters();

        renderDocuments(
            currentSearchResults.length ||
            document.getElementById("searchInput")?.value.trim()
                ? currentSearchResults
                : allDocuments
        );

        renderRecentDocuments();
        updateStatistics();

    } catch (error) {
        showMessage(error.message, "error");
    }
}
function updateStatistics() {
    const favorites = getFavorites();

    document.getElementById("totalDocuments").textContent =
        allDocuments.length;

    document.getElementById("totalFavorites").textContent =
        favorites.length;

    document.getElementById("navDocBadge").textContent =
        allDocuments.length;

    document.getElementById("navFavBadge").textContent =
        favorites.length;
}

function createDocumentCard(docItem, options = {}) {
    const documentId = getDocumentId(docItem);
    const filename = docItem.filename || "Unnamed document";
    const extension = getFileType(filename);

    const favorites = getFavorites();
    const isFavorite = favorites.includes(documentId);
    const isShared = Boolean(docItem.is_shared);

    const card = document.createElement("article");
    card.className = "document-card";

    const isOwnDivision =
        docItem.division === currentUser?.division;

    const sharingControl =
        options.showSharing &&
        currentUser?.role === "admin" &&
        isOwnDivision
            ? `
                <button class="secondary-btn compact-btn sharing-toggle-btn"
                    onclick="toggleDocumentSharing(
                        '${escapeHTML(documentId)}',
                        ${!isShared}
                    )">
                    ${isShared ? "Stop Sharing" : "Share Document"}
                </button>
            `
            : "";

    card.innerHTML = `
        <div class="document-card-top">
            <span class="doc-badge badge-default">${extension}</span>

            <button class="favorite-btn ${isFavorite ? "active" : ""}"
                onclick="toggleFavorite('${escapeHTML(documentId)}')"
                title="${isFavorite ? "Remove from favorites" : "Add to favorites"}"
                aria-label="Toggle favorite">
                ${isFavorite ? "♥" : "♡"}
            </button>
        </div>

        <div class="document-card-body">
            <h3 title="${escapeHTML(filename)}">
                ${escapeHTML(filename)}
            </h3>

            <p>${escapeHTML(
                docItem.division || currentUser?.division || ""
            )}</p>

            <span class="document-date">
                ${formatDate(docItem.upload_date)}
            </span>
        </div>

        
        <div class="document-card-actions">
            <button class="secondary-btn compact-btn"
                onclick="viewDocumentDetails('${escapeHTML(documentId)}')">
                View Details
            </button>

            <button class="secondary-btn compact-btn"
                onclick="previewDocument('${escapeHTML(documentId)}')">
                Preview
            </button>


            <button class="primary-btn compact-btn"
                onclick="downloadDocument('${escapeHTML(documentId)}')">
                Download
            </button>

            ${sharingControl}
        </div>

        ${options.showSharing && isOwnDivision ? `
            <div class="sharing-status">
                ${isShared
                    ? "🌐 Shared with other divisions"
                    : "🔒 Private"}
            </div>
        ` : ""}
    `;

    return card;
}

function renderDocuments(documents) {
    const container = document.getElementById("documentsList");

    if (!container) return;

    container.innerHTML = "";

    const filtered = documents.filter(doc => {
        if (activeTypeFilter === "all") return true;

        const extension = getFileExtension(doc.filename || "");

        if (activeTypeFilter === "pdf") {
            return extension === "pdf";
        }

        if (activeTypeFilter === "txt") {
            return extension === "txt";
        }

        if (activeTypeFilter === "img") {
            return ["png", "jpg", "jpeg"].includes(extension);
        }

        return true;
    });

    filtered.forEach(doc => {
        container.appendChild(
            createDocumentCard(doc, { showSharing: true })
        );
    });

    document.getElementById("documentCount").textContent =
        `${filtered.length} document${filtered.length === 1 ? "" : "s"}`;

    if (!filtered.length) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No documents found</h3>
                <p>Upload a document or try another search.</p>
            </div>
        `;
    }
}

function renderRecentDocuments() {
    const container = document.getElementById("recentDocuments");

    if (!container) return;

    container.innerHTML = "";

    const recent = [...allDocuments]
        .sort((a, b) =>
            new Date(b.upload_date || 0) -
            new Date(a.upload_date || 0)
        )
        .slice(0, 3);

    if (!recent.length) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No documents yet</h3>
                <p>Upload your first document to get started.</p>
            </div>
        `;
        return;
    }

    recent.forEach(doc => {
        container.appendChild(createDocumentCard(doc));
    });
}

function filterByType(type, button) {
    activeTypeFilter = type;

    document.querySelectorAll(".filter-pill").forEach(item => {
        item.classList.remove("active");
    });

    button?.classList.add("active");

    const searchInput = document.getElementById("searchInput");
    const hasSearch = Boolean(searchInput?.value.trim());

    renderDocuments(
        hasSearch ? currentSearchResults : allDocuments
    );
}

function toggleFavorite(documentId) {
    let favorites = getFavorites();

    if (favorites.includes(documentId)) {
        favorites = favorites.filter(id => id !== documentId);
    } else {
        favorites.push(documentId);
    }

    saveFavorites(favorites);

    const hasSearch = Boolean(
        document.getElementById("searchInput")?.value.trim()
    );

    renderDocuments(
        hasSearch ? currentSearchResults : allDocuments
    );

    renderFavorites();
    renderRecentDocuments();
}

function renderFavorites() {
    const container = document.getElementById("favoritesList");

    if (!container) return;

    container.innerHTML = "";

    const favorites = getFavorites();

    const favoriteDocuments = allDocuments.filter(doc =>
        favorites.includes(getDocumentId(doc))
    );

    if (!favoriteDocuments.length) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No favorites yet</h3>
                <p>Use the heart icon on a document to save it here.</p>
            </div>
        `;
        return;
    }

    favoriteDocuments.forEach(doc => {
        container.appendChild(createDocumentCard(doc));
    });
}


/* ==========================================================
   OCR-POWERED DOCUMENT SEARCH
   ========================================================== */

async function searchDocuments() {
    const searchInput = document.getElementById("searchInput");
    const query = searchInput.value.trim();

    document.getElementById("clearSearchBtn")
        ?.classList.toggle("hidden", !query);

    if (!query) {
        currentSearchResults = [];
        renderDocuments(allDocuments);
        return;
    }

    try {
        // Company assignment search endpoint.
        // Backend searches filename, OCR text and metadata.
        const data = await apiRequest(
            `/search?q=${encodeURIComponent(query)}`
        );

        currentSearchResults = data.search_results || [];

        renderDocuments(currentSearchResults);

    } catch (error) {
        showMessage(error.message, "error");
    }
}

function clearSearch() {
    document.getElementById("searchInput").value = "";

    document.getElementById("clearSearchBtn")
        ?.classList.add("hidden");

    currentSearchResults = [];

    renderDocuments(allDocuments);
}

/* ==========================================================
   DYNAMIC METADATA — UPLOAD FORM
   ========================================================== */

function renderUploadMetadataFields() {
    const uploadForm = document.getElementById("uploadForm");

    if (!uploadForm) return;

    let container = document.getElementById("uploadMetadataFields");

    if (!container) {
        container = document.createElement("div");
        container.id = "uploadMetadataFields";
        container.className = "upload-metadata-fields";

        const submitButton = uploadForm.querySelector(
            'button[type="submit"], input[type="submit"]'
        );

        if (submitButton) {
            submitButton.parentElement.insertBefore(
                container,
                submitButton
            );
        } else {
            uploadForm.appendChild(container);
        }
    }

    container.innerHTML = `
        <div class="metadata-section-heading">
            <h3>Document Metadata</h3>
            <p>Enter additional information about this document.</p>
        </div>
    `;

    if (!metadataFields.length) {
        container.innerHTML += `
            <p class="empty-state">
                No metadata fields have been configured by the admin.
            </p>
        `;
        return;
    }

    const fieldsGrid = document.createElement("div");
    fieldsGrid.className = "metadata-input-grid";

    metadataFields.forEach(field => {
        const wrapper = document.createElement("div");
        wrapper.className = "form-group metadata-input-group";

        const label = document.createElement("label");
        label.textContent = field.field_name;

        label.htmlFor = `metadata_${field.field_id}`;

        let input;

        if (field.field_type === "boolean") {
            input = document.createElement("select");

            input.innerHTML = `
                <option value="">Select an option</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
            `;

        } else {
            input = document.createElement("input");

            input.type = ["text", "number", "date"].includes(
                field.field_type
            )
                ? field.field_type
                : "text";

            input.placeholder = `Enter ${field.field_name}`;

            if (field.field_type === "number") {
                input.step = "any";
            }
        }

        input.id = `metadata_${field.field_id}`;
        input.name = `metadata_${field.field_name}`;
        input.dataset.metadataName = field.field_name;
        input.dataset.metadataType = field.field_type;

        wrapper.appendChild(label);
        wrapper.appendChild(input);
        fieldsGrid.appendChild(wrapper);
    });

    container.appendChild(fieldsGrid);
}

function collectUploadMetadata() {
    const metadata = {};

    document.querySelectorAll(
        "#uploadMetadataFields [data-metadata-name]"
    ).forEach(input => {
        const fieldName = input.dataset.metadataName;
        const fieldType = input.dataset.metadataType;
        const rawValue = input.value.trim();

        // Empty optional metadata fields are not submitted.
        if (rawValue === "") return;

        if (fieldType === "number") {
            const numberValue = Number(rawValue);

            if (!Number.isFinite(numberValue)) {
                throw new Error(
                    `${fieldName} must be a valid number.`
                );
            }

            metadata[fieldName] = numberValue;

        } else if (fieldType === "boolean") {
            metadata[fieldName] = rawValue === "true";

        } else {
            metadata[fieldName] = rawValue;
        }
    });

    return metadata;
}


/* ==========================================================
   DYNAMIC ADMIN METADATA SETTINGS
   ========================================================== */

// Connect the metadata form already present in index.html.
const metadataAdminForm = document.getElementById("metadataFieldForm");

if (metadataAdminForm) {
    metadataAdminForm.addEventListener("submit", saveMetadataField);
}


// Load and display metadata settings.
async function loadMetadataSettings() {
    if (currentUser?.role !== "admin") {
        showMessage("Only administrators can manage metadata fields.", "error");
        return;
    }

    await loadMetadataFields();
}


// Display the metadata fields in the existing HTML page.
function renderMetadataSettingsList() {
    const container = document.getElementById("metadataFieldsList");

    if (!container) return;

    container.innerHTML = "";

    if (!metadataFields.length) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No metadata fields configured</h3>
                <p>Create your first custom metadata field above.</p>
            </div>
        `;
        return;
    }

    const table = document.createElement("table");
    table.className = "metadata-settings-table";

    table.innerHTML = `
        <thead>
            <tr>
                <th>Field Name</th>
                <th>Field Type</th>
                <th>Action</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");

    metadataFields.forEach(field => {
        const row = document.createElement("tr");

        const nameCell = document.createElement("td");
        nameCell.textContent = field.field_name;

        const typeCell = document.createElement("td");
        typeCell.textContent = field.field_type;

        const actionCell = document.createElement("td");
        const editButton = document.createElement("button");

        editButton.type = "button";
        editButton.className = "secondary-btn compact-btn";
        editButton.textContent = "Edit";

        editButton.addEventListener("click", () => {
            editMetadataField(field.field_id);
        });

        actionCell.appendChild(editButton);

        row.append(nameCell, typeCell, actionCell);
        tbody.appendChild(row);
    });

    container.appendChild(table);
}


// Add a new metadata field or update an existing one.
async function saveMetadataField(event) {
    event.preventDefault();

    if (currentUser?.role !== "admin") {
        showMessage("Only administrators can manage metadata fields.", "error");
        return;
    }

    const nameInput = document.getElementById("metadataFieldName");
    const typeInput = document.getElementById("metadataFieldType");
    const form = document.getElementById("metadataFieldForm");

    const fieldName = nameInput.value.trim();
    const fieldType = typeInput.value;

    if (!fieldName) {
        showMessage("Please enter a metadata field name.", "error");
        return;
    }

    const button = form.querySelector('button[type="submit"]');

    if (button) button.disabled = true;

    try {
        const payload = {
            field_name: fieldName,
            field_type: fieldType
        };

        const editId = form.dataset.editId;

        let data;

        if (editId) {
            data = await apiRequest(
                `/metadata/fields/${encodeURIComponent(editId)}`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload)
                }
            );
        } else {
            data = await apiRequest("/metadata/fields", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
        }

        showMessage(
            data.message || "Metadata field saved successfully.",
            "success"
        );

        resetMetadataForm();

        await loadMetadataFields();

    } catch (error) {
        showMessage(error.message, "error");
    } finally {
        if (button) button.disabled = false;
    }
}


// Load an existing field into the form for editing.
function editMetadataField(fieldId) {
    if (currentUser?.role !== "admin") return;

    const field = metadataFields.find(
        item => item.field_id === fieldId
    );

    if (!field) {
        showMessage("Metadata field not found.", "error");
        return;
    }

    const form = document.getElementById("metadataFieldForm");

    document.getElementById("metadataFieldName").value =
        field.field_name;

    document.getElementById("metadataFieldType").value =
        field.field_type;

    form.dataset.editId = field.field_id;

    const button = form.querySelector('button[type="submit"]');

    if (button) {
        button.textContent = "Save Changes";
    }

    document.getElementById("metadataFieldName").focus();
}


// Reset the form after adding, editing or cancelling.
function resetMetadataForm() {
    const form = document.getElementById("metadataFieldForm");

    if (!form) return;

    form.reset();

    delete form.dataset.editId;

    const button = form.querySelector('button[type="submit"]');

    if (button) {
        button.textContent = "Add Metadata Field";
    }
}


/* ==========================================================
   UPLOAD DOCUMENT
   ========================================================== */

const documentFileInput = document.getElementById("documentFile");

if (documentFileInput) {
    documentFileInput.addEventListener(
        "change",
        showSelectedFile
    );
}

function showSelectedFile() {
    const file = documentFileInput?.files?.[0];

    if (!file) return;

    document.getElementById("selectedFileCard")
        ?.classList.remove("hidden");

    document.getElementById("selectedFileName").textContent =
        file.name;

    document.getElementById("selectedFileSize").textContent =
        `${(file.size / 1024).toFixed(1)} KB`;

    document.getElementById("selectedFileIcon").textContent =
        getFileType(file.name);
}

function resetFileSelection() {
    if (documentFileInput) {
        documentFileInput.value = "";
    }

    document.getElementById("selectedFileCard")
        ?.classList.add("hidden");
}

const uploadForm = document.getElementById("uploadForm");

if (uploadForm) {
    uploadForm.addEventListener("submit", async event => {
        event.preventDefault();

        const file = documentFileInput?.files?.[0];

        if (!file) {
            showMessage("Please select a file first.", "error");
            return;
        }

        const button = document.getElementById(
            "uploadSubmitBtn"
        );

        if (button) button.disabled = true;

        try {
            const metadata = collectUploadMetadata();

            const formData = new FormData();

            formData.append("file", file);
            formData.append(
                "metadata",
                JSON.stringify(metadata)
            );
            formData.append("is_shared", "false");

            const data = await apiRequest(
                "/documents/upload",
                {
                    method: "POST",
                    body: formData
                }
            );

            showMessage(
                data.message ||
                    "Document uploaded successfully!"
            );

            uploadForm.reset();
            resetFileSelection();

            await loadDocuments();

            navigateTo("documentsView");

        } catch (error) {
            showMessage(error.message, "error");
        } finally {
            if (button) button.disabled = false;
        }
    });
}


/* ==========================================================
   DRAG AND DROP
   ========================================================== */

const dropZone = document.getElementById("dropZone");

if (dropZone) {
    ["dragenter", "dragover"].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
            event.preventDefault();
            dropZone.classList.add("drag-over");
        });
    });

    ["dragleave", "drop"].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
            event.preventDefault();
            dropZone.classList.remove("drag-over");
        });
    });

    dropZone.addEventListener("drop", event => {
        const files = event.dataTransfer.files;

        if (!files.length || !documentFileInput) return;

        documentFileInput.files = files;
        showSelectedFile();
    });
}


/* ==========================================================
   DOCUMENT PREVIEW
   ========================================================== */

async function previewDocument(documentId) {
    try {
        const response = await fetch(
            `${API_URL}/documents/download/${encodeURIComponent(documentId)}`,
            {
                headers: {
                    Authorization: `Bearer ${getToken()}`
                }
            }
        );

        if (!response.ok) {
            let errorData = {};

            try {
                errorData = await response.json();
            } catch {}

            throw new Error(
                errorData.error ||
                "Unable to preview document."
            );
        }

        const blob = await response.blob();

        if (currentViewerURL) {
            URL.revokeObjectURL(currentViewerURL);
        }

        currentViewerURL = URL.createObjectURL(blob);

        const doc = allDocuments.find(
            item => getDocumentId(item) === documentId
        );

        const filename = doc?.filename || "Document Preview";
        const extension = getFileExtension(filename);

        document.getElementById("viewerTitle").textContent =
            filename;

        document.getElementById("viewerSubtitle").textContent =
            doc?.division || currentUser?.division || "Document";

        document.getElementById("viewerTypeBadge").textContent =
            getFileType(filename);

        const viewerContent = document.getElementById(
            "viewerContent"
        );

        viewerContent.innerHTML = "";

        if (extension === "pdf") {
            const iframe = document.createElement("iframe");

            iframe.src = currentViewerURL;
            iframe.className = "pdf-preview";
            iframe.title = filename;

            viewerContent.appendChild(iframe);

        } else if (["png", "jpg", "jpeg"].includes(extension)) {
            const image = document.createElement("img");

            image.src = currentViewerURL;
            image.alt = filename;
            image.className = "image-preview";

            viewerContent.appendChild(image);

        } else if (extension === "txt") {
            const text = await blob.text();
            const pre = document.createElement("pre");

            pre.className = "text-preview";
            pre.textContent = text;

            viewerContent.appendChild(pre);

        } else {
            viewerContent.textContent =
                "Preview is not supported for this file type.";
        }

        const downloadLink = document.getElementById(
            "viewerDownload"
        );

        downloadLink.href = currentViewerURL;
        downloadLink.download = filename;

        document.getElementById("viewerModal")
            .classList.remove("hidden");

    } catch (error) {
        showMessage(error.message, "error");
    }
}

function closeViewer() {
    document.getElementById("viewerModal")
        ?.classList.add("hidden");

    if (currentViewerURL) {
        URL.revokeObjectURL(currentViewerURL);
        currentViewerURL = null;
    }

    currentViewerDocument = null;
}

function handleModalBackdropClick(event) {
    if (event.target.id === "viewerModal") {
        closeViewer();
    }
}

async function downloadDocument(documentId) {
    try {
        const response = await fetch(
            `${API_URL}/documents/download/${encodeURIComponent(documentId)}`,
            {
                headers: {
                    Authorization: `Bearer ${getToken()}`
                }
            }
        );

        if (!response.ok) {
            let errorData = {};

            try {
                errorData = await response.json();
            } catch {}

            throw new Error(
                errorData.error || "Download failed."
            );
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const doc = allDocuments.find(
            item => getDocumentId(item) === documentId
        );

        const link = document.createElement("a");

        link.href = url;
        link.download = doc?.filename || "document";

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);

    } catch (error) {
        showMessage(error.message, "error");
    }
}


/* ==========================================================
   DOCUMENT SHARING CONTROLS
   ========================================================== */

async function toggleDocumentSharing(documentId, isShared) {
    const action = isShared ? "share" : "stop sharing";

    if (!confirm(
        `Are you sure you want to ${action} this document?`
    )) {
        return;
    }

    try {
        const data = await apiRequest(
            `/documents/share/${encodeURIComponent(documentId)}`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    is_shared: isShared
                })
            }
        );

        showMessage(
            data.message || "Sharing settings updated."
        );

        await loadDocuments();

    } catch (error) {
        showMessage(error.message, "error");
    }
}


/* ==========================================================
   DISCOVER OTHER DIVISIONS' SHARED DOCUMENTS
   ========================================================== */


/* ==========================================================
   DISCOVER OTHER DIVISIONS' SHARED DOCUMENTS
   ========================================================== */

async function loadDiscoveredDocuments() {
    const container = document.getElementById("discoverList");

    if (!container) return;

    container.innerHTML = `
        <div class="empty-state">
            <p>Loading shared documents...</p>
        </div>
    `;

    try {
        // Load shared documents and the current user's requests
        const [documentData, requestData] = await Promise.all([
            apiRequest("/documents/discover"),
            apiRequest("/documents/my-access-requests")
        ]);

        discoveredDocuments = documentData.documents || [];

        const myRequests = requestData.my_requests || [];

        // Match requests using document_id
        window.documentAccessStatuses = {};

        myRequests.forEach(req => {
            if (req.document_id) {
                window.documentAccessStatuses[req.document_id] =
                    (req.status || "pending").toLowerCase();
            }
        });

        renderDiscoveredDocuments(discoveredDocuments);

    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>Unable to load shared documents</h3>
                <p>${escapeHTML(error.message)}</p>
            </div>
        `;
    }
}

function renderDiscoveredDocuments(documents) {
    const container = document.getElementById("discoverList");

    if (!container) return;

    container.innerHTML = "";

    const count = document.getElementById("discoverCount");

    if (count) {
        count.textContent =
            `${documents.length} shared document${documents.length === 1 ? "" : "s"}`;
    }

    if (!documents.length) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No documents available</h3>
                <p>Documents from other divisions will appear here.</p>
            </div>
        `;
        return;
    }

    documents.forEach(doc => {
        const card = document.createElement("article");
        card.className = "document-card";

        const documentId = getDocumentId(doc);
        const filename = doc.filename || "Unnamed document";

        const accessStatus =
            window.documentAccessStatuses?.[documentId] || "none";

        let actionHTML = "";
        let noteHTML = "";

        if (accessStatus === "approved") {
            actionHTML = `
                <button class="primary-btn compact-btn"
                    onclick="previewDocument('${escapeHTML(documentId)}')">
                    Preview
                </button>

                <button class="secondary-btn compact-btn"
                    onclick="downloadDocument('${escapeHTML(documentId)}')">
                    Download
                </button>
            `;

            noteHTML = `
                <p class="access-note">
                    ✓ Access approved. Preview and download are available.
                </p>
            `;

        } else if (accessStatus === "pending") {
            actionHTML = `
                <button class="secondary-btn compact-btn" disabled>
                    Request Pending
                </button>
            `;

            noteHTML = `
                <p class="access-note">
                    ⌛ Waiting for the owning division's user or admin to review your request.
                </p>
            `;

        } else {
            actionHTML = `
                <button class="primary-btn compact-btn"
                    onclick="requestDocumentAccess(
                        '${escapeHTML(documentId)}',
                        '${escapeHTML(filename)}'
                    )">
                    Request Access
                </button>
            `;

            noteHTML = `
                <p class="access-note">
                    🔒 Preview and download become available after approval.
                </p>
            `;
        }

        card.innerHTML = `
            <div class="document-card-top">
                <span class="doc-badge badge-default">
                    ${getFileType(filename)}
                </span>

                <span class="sharing-status">
    ${doc.is_shared ? "🌐 Shared" : "🔒 Private"}
</span>
            </div>

            <div class="document-card-body">
                <h3>${escapeHTML(filename)}</h3>

                <p>
                    Owner:
                    ${escapeHTML(doc.division || "Unknown division")}
                </p>

                <span class="document-date">
                    ${formatDate(doc.upload_date)}
                </span>
            </div>

            <div class="document-card-actions">
                ${actionHTML}
            </div>

            ${noteHTML}
        `;

        container.appendChild(card);
    });
}


async function searchDiscoveredDocuments() {
    const input = document.getElementById(
        "discoverSearchInput"
    );

    if (!input) return;

    const query = input.value.trim().toLowerCase();

    const filtered = discoveredDocuments.filter(doc => {
        const filename = (doc.filename || "").toLowerCase();
        const division = (doc.division || "").toLowerCase();
        const metadata = JSON.stringify(
            doc.metadata || {}
        ).toLowerCase();

        return (
            filename.includes(query) ||
            division.includes(query) ||
            metadata.includes(query)
        );
    });

    renderDiscoveredDocuments(filtered);
}


/* ==========================================================
   REQUEST ACCESS
   ========================================================== */

async function requestDocumentAccess(documentId, filename) {
    const reason = prompt(
        `Why do you need access to "${filename}"?\n\nEnter your reason:`
    );

    if (reason === null) return;

    if (!reason.trim()) {
        showMessage(
            "Please enter a reason for requesting access.",
            "error"
        );
        return;
    }

    try {
        const data = await apiRequest(
            "/documents/access-request",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    doc_id: documentId,
                    reason: reason.trim()
                })
            }
        );

        showMessage(
            data.message || "Access request submitted."
        );

        await loadMyAccessRequests();
        await loadDiscoveredDocuments();

    } catch (error) {
        showMessage(error.message, "error");
    }
}


/* ==========================================================
   MY ACCESS REQUESTS
   ========================================================== */

async function loadMyAccessRequests() {
    const container = document.getElementById(
        "myRequestsList"
    );

    if (!container) return;

    try {
        const data = await apiRequest(
            "/documents/my-access-requests"
        );

        renderMyAccessRequests(data.my_requests || []);

    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>Unable to load your requests</h3>
                <p>${escapeHTML(error.message)}</p>
            </div>
        `;
    }
}

function renderMyAccessRequests(requests) {
    const container = document.getElementById(
        "myRequestsList"
    );

    if (!container) return;

    container.innerHTML = "";

    if (!requests.length) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No access requests yet</h3>
                <p>Requests you send to other divisions will appear here.</p>
            </div>
        `;
        return;
    }

    requests.forEach(req => {
        const status = (
            req.status || "pending"
        ).toLowerCase();

        const card = document.createElement("article");
        card.className = "document-card";

        card.innerHTML = `
            <div class="document-card-top">
                <span class="doc-badge badge-default">
                    REQUEST
                </span>

                <span class="request-status status-${escapeHTML(status)}">
                    ${escapeHTML(status.toUpperCase())}
                </span>
            </div>

            <div class="document-card-body">
                <h3>${escapeHTML(req.filename)}</h3>

                <p>
                    Requested from:
                    ${escapeHTML(req.owner_division || "Unknown")}
                </p>

                <p>
                    Your reason:
                    ${escapeHTML(req.reason || "Not provided")}
                </p>

                <span class="document-date">
                    Requested: ${formatDate(req.created_at)}
                </span>
            </div>

            <div class="access-note">
                ${
                    status === "approved"
                        ? "✓ Access approved. You can find this document in All Documents."
                        : status === "rejected"
                            ? "✕ Your request was rejected. The document remains inaccessible."
                            : "⌛ Waiting for the owning division's admin to review your request."
                }
            </div>
        `;

        container.appendChild(card);
    });
}


/* ==========================================================
   ADMIN ACCESS REQUEST INBOX
   ========================================================== */

async function loadAccessInbox() {
    const container = document.getElementById(
        "accessInboxList"
    );

    if (!container || !currentUser) return;

    try {
        const data = await apiRequest(
            "/documents/access-requests"
        );

        renderAccessInbox(data.access_requests || []);

    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>Unable to load access requests</h3>
                <p>${escapeHTML(error.message)}</p>
            </div>
        `;
    }
}

function renderAccessInbox(requests) {
    const container = document.getElementById(
        "accessInboxList"
    );

    if (!container) return;

    container.innerHTML = "";

    if (!requests.length) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No access requests</h3>
                <p>
                    Requests for documents owned by your division
                    will appear here.
                </p>
            </div>
        `;
        return;
    }

    requests.forEach(req => {
        const status = (
            req.status || "pending"
        ).toLowerCase();

        const card = document.createElement("article");
        card.className = "document-card";

        card.innerHTML = `
            <div class="document-card-top">
                <span class="doc-badge badge-default">
                    ACCESS REQUEST
                </span>

                <span class="request-status status-${escapeHTML(status)}">
                    ${escapeHTML(status.toUpperCase())}
                </span>
            </div>

            <div class="document-card-body">
                <h3>${escapeHTML(req.filename)}</h3>

                <p>
                    Requested by division:
                    ${escapeHTML(req.requester_division || "Unknown")}
                </p>

                <p>
                    Reason:
                    ${escapeHTML(req.reason || "Not provided")}
                </p>

                <span class="document-date">
                    Requested: ${formatDate(req.created_at)}
                </span>
            </div>

            ${status === "pending" ? `
                <div class="document-card-actions">
                    <button class="primary-btn compact-btn"
                        onclick="reviewAccessRequest(
                            '${escapeHTML(req.request_id)}',
                            'approved'
                        )">
                        Approve
                    </button>

                    <button class="secondary-btn compact-btn"
                        onclick="reviewAccessRequest(
                            '${escapeHTML(req.request_id)}',
                            'rejected'
                        )">
                        Reject
                    </button>
                </div>
            ` : ""}
        `;

        container.appendChild(card);
    });
}

async function reviewAccessRequest(requestId, status) {
    const action = status === "approved"
        ? "approve"
        : "reject";

    if (!confirm(
        `Are you sure you want to ${action} this access request?`
    )) {
        return;
    }

    try {
        const data = await apiRequest(
            `/documents/access-request/${encodeURIComponent(requestId)}`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ status })
            }
        );

        showMessage(
            data.message || `Request ${status}.`
        );

        await loadAccessInbox();

    } catch (error) {
        showMessage(error.message, "error");
    }
}


/* ==========================================================
   THEME — LIGHT / DARK MODE
   ========================================================== */

function applyTheme(theme) {
    const isDark = theme === "dark";

    document.body.classList.toggle(
        "dark-theme",
        isDark
    );

    document.documentElement.setAttribute(
        "data-theme",
        isDark ? "dark" : "light"
    );

    const themeIcon = document.getElementById("themeIcon");
    const themeText = document.getElementById("themeText");

    if (themeIcon) {
        themeIcon.textContent = isDark ? "☀️" : "🌙";
    }

    if (themeText) {
        themeText.textContent = isDark
            ? "Light Mode"
            : "Dark Mode";
    }

    localStorage.setItem(
        "triad_theme",
        isDark ? "dark" : "light"
    );
}

function toggleTheme() {
    const isDark = document.body.classList.contains(
        "dark-theme"
    );

    const nextTheme = isDark ? "light" : "dark";

    const themeButton = document.querySelector(
        "#themeToggle, .appearance-btn"
    );

    let x = window.innerWidth - 40;
    let y = 30;

    if (themeButton) {
        const rect = themeButton.getBoundingClientRect();

        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
    }

    document.documentElement.style.setProperty(
        "--theme-x",
        `${x}px`
    );

    document.documentElement.style.setProperty(
        "--theme-y",
        `${y}px`
    );

    if (document.startViewTransition) {
        document.startViewTransition(() => {
            applyTheme(nextTheme);
        });
    } else {
        applyTheme(nextTheme);
    }
}


/* ==========================================================
   INITIALIZATION
   ========================================================== */

document.addEventListener("DOMContentLoaded", async () => {
    const savedTheme =
        localStorage.getItem("triad_theme") || "light";

    applyTheme(savedTheme);

    currentUser = getCurrentUser();

    if (getToken() && currentUser) {
        await openApplication();
    } else {
        document.getElementById("authScreen")
            .classList.remove("hidden");

        document.getElementById("appScreen")
            .classList.add("hidden");
    }
});


async function runAdvancedSearch() {
    const query = document.getElementById("advancedSearchInput")
        .value.trim();

    const division = document.getElementById("advancedDivision")
        .value.trim();

    const reportType = document.getElementById("advancedReportType")
        .value.trim();

    const resultsContainer = document.getElementById("advancedSearchResults");

    if (!query) {
        showMessage("Please enter a search keyword.", "error");
        return;
    }

    resultsContainer.innerHTML = "<p>Searching documents...</p>";

    try {
        const params = new URLSearchParams({
            q: query
        });

        if (division) {
            params.append("division", division);
        }

        if (reportType) {
            params.append("report_type", reportType);
        }

        const data = await apiRequest(`/search?${params.toString()}`);

        const results = data.search_results || [];

        resultsContainer.innerHTML = "";

        if (!results.length) {
            resultsContainer.innerHTML = `
                <div class="empty-state">
                    <h3>No documents found</h3>
                    <p>Try another keyword or change your filters.</p>
                </div>
            `;
            return;
        }

        results.forEach(doc => {
            resultsContainer.appendChild(
                createDocumentCard(doc, { showSharing: true })
            );
        });

    } catch (error) {
        resultsContainer.innerHTML = "";
        showMessage(error.message, "error");
    }
}


function clearAdvancedSearch() {
    document.getElementById("advancedSearchInput").value = "";
    document.getElementById("advancedDivision").value = "";
    document.getElementById("advancedReportType").value = "";

    document.getElementById("advancedSearchResults").innerHTML =
        "<p>Enter a keyword and click Search.</p>";
}

function renderAdvancedSearchFilters() {
    const divisionSelect = document.getElementById("advancedDivision");
    const reportTypeSelect = document.getElementById("advancedReportType");

    if (!divisionSelect || !reportTypeSelect) return;

    // Division is a document-level property, not a custom metadata field.
    const divisions = [...new Set(
        allDocuments
            .map(doc => doc.division)
            .filter(Boolean)
    )];

    divisionSelect.innerHTML =
        '<option value="">All accessible divisions</option>';

    divisions.forEach(division => {
        const option = document.createElement("option");
        option.value = division;
        option.textContent = division;
        divisionSelect.appendChild(option);
    });

    // Report Type comes from the dynamic metadata configuration.
    const reportTypeField = metadataFields.find(
        field => field.field_name === "Report Type"
    );

    reportTypeSelect.innerHTML =
        '<option value="">All report types</option>';

    if (!reportTypeField) return;

    const reportTypes = [...new Set(
        allDocuments
            .map(doc => doc.metadata?.["Report Type"])
            .filter(value => value !== undefined && value !== null && value !== "")
            .map(String)
    )];

    reportTypes.forEach(value => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        reportTypeSelect.appendChild(option);
    });
}

function viewDocumentDetails(documentId) {
    const docItem = allDocuments.find(
        doc => getDocumentId(doc) === documentId
    );

    if (!docItem) {
        showMessage("Document details not found.", "error");
        return;
    }

    navigateTo("documentDetailsView");

    const container = document.getElementById(
        "documentDetailsContent"
    );

    const metadata = docItem.metadata || {};

    const metadataHTML = Object.entries(metadata).length
        ? Object.entries(metadata).map(([key, value]) => `
            <div class="form-group">
                <label>${escapeHTML(key)}</label>
                <p>${escapeHTML(String(value ?? ""))}</p>
            </div>
        `).join("")
        : "<p>No custom metadata available.</p>";

    container.innerHTML = `
        <h2>${escapeHTML(docItem.filename || "Unnamed document")}</h2>

        <div class="metadata-input-grid" style="margin-top:20px;">
            <div class="form-group">
                <label>Division</label>
                <p>${escapeHTML(docItem.division || "Unavailable")}</p>
            </div>

            <div class="form-group">
                <label>Upload Date</label>
                <p>${escapeHTML(formatDate(docItem.upload_date))}</p>
            </div>

            <div class="form-group">
                <label>Document Type</label>
                <p>${escapeHTML(getFileType(docItem.filename || ""))}</p>
            </div>

<div class="form-group">
    <label>Sharing Status</label>
    <p>${docItem.is_shared
        ? "🌐 Shared with other divisions"
        : "🔒 Private"}</p>
</div>

        </div>

        <h3 style="margin-top:24px;">Custom Metadata</h3>

        <div class="metadata-input-grid" style="margin-top:12px;">
            ${metadataHTML}
        </div>

        <div class="document-card-actions" style="margin-top:24px;">
            <button class="secondary-btn compact-btn"
                onclick="previewDocument('${escapeHTML(getDocumentId(docItem))}')">
                Preview
            </button>

            <button class="primary-btn compact-btn"
                onclick="downloadDocument('${escapeHTML(getDocumentId(docItem))}')">
                Download
            </button>
        </div>
    `;
}

window.viewDocumentDetails = viewDocumentDetails;
window.runAdvancedSearch = runAdvancedSearch;
window.clearAdvancedSearch = clearAdvancedSearch;