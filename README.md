# Pulsar - Django with Tailwind CSS and Flowbite

A modern Django web application featuring Tailwind CSS and Flowbite components with dark mode support.

## Features

- Django 5.2 framework
- Tailwind CSS for styling
- Flowbite UI components
- Dark mode toggle with preference saving
- Responsive design

## Prerequisites

- Python 3.8 or higher
- Node.js and npm

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/pulsar.git
   cd pulsar
   ```

2. Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Install Node.js dependencies:
   ```bash
   npm install
   ```

5. Build the Tailwind CSS:
   ```bash
   npm run build
   ```

6. Apply Django migrations:
   ```bash
   python manage.py migrate
   ```

7. Run the development server:
   ```bash
   python manage.py runserver
   ```

8. Visit http://127.0.0.1:8000/ in your browser.

## Development

For active development, run two terminals:

1. Django development server:
   ```bash
   python manage.py runserver
   ```

2. Tailwind CSS watcher:
   ```bash
   npm run dev
   ```

## Project Structure

- `main/` - Django app with views and models
- `pulsar/` - Main Django project settings
- `templates/` - HTML templates
- `static/` - Static files (CSS, JS, images)
  - `src/` - Source files for Tailwind CSS
  - `dist/` - Compiled CSS files

## Tailwind CSS Configuration

The project uses Tailwind CSS with dark mode support. Dark mode is implemented using the 'class' strategy, toggled with JavaScript and stored in localStorage.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Django](https://www.djangoproject.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Flowbite](https://flowbite.com/) 