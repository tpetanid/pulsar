# Pulsar - Vet Cardio App

A Django web application for managing veterinary cardiology records, built with Tailwind CSS and Vue.js sprinkles.

## Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd pulsar
    ```

2.  **Create and activate a Python virtual environment:**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows use `venv\Scripts\activate`
    ```

3.  **Install Python dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Install Node.js dependencies:**
    ```bash
    npm install
    ```

5.  **Create environment file:**
    *   Copy the `.env.example` file (or create it manually if `.env.example` doesn't exist) to `.env`.
    *   Generate a strong `DJANGO_SECRET_KEY` (e.g., using a generator tool or `python -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())'`) and replace the placeholder in `.env`.
    *   Ensure `DJANGO_DEBUG=True` is set in `.env` for development.

6.  **Build Tailwind CSS:**
    ```bash
    npm run css:build
    ```

7.  **Run Django Migrations:**
    ```bash
    python manage.py migrate
    ```

8.  **(Optional) Create Superuser:**
    ```bash
    python manage.py createsuperuser
    ```

## Running the Development Server

1.  **Start the Tailwind watcher (optional, in a separate terminal):**
    ```bash
    npm run css:watch
    ```

2.  **Start the Django development server:**
    ```bash
    python manage.py runserver
    ```

3.  Open your browser to `http://127.0.0.1:8000/`

## Basic Usage

*   Access the main application pages through the navbar.
*   Use the "Owners" page for CRUD operations via modals.
*   Use the "Manage" page for bulk data import/export.
*   Access the Django admin interface at `/admin/` (requires superuser). 