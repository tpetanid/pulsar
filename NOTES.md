# Project Notes & Discussions

## API Implementation Strategy (Species/Owner CRUD)

**Context:** When implementing the Species CRUD functionality, we could use standard Django class-based views (`View`) versus using the Django REST Framework (DRF).

**Current Approach:**
*   Used standard Django `View` subclasses.
*   Implemented a combined `SpeciesListCreateView` to handle both `GET` (list) and `POST` (create) requests on the `/api/species/` endpoint.
*   Implemented a separate `SpeciesDeleteView` for `DELETE` requests on `/api/species/<str:code>/`.
*   Manually handled JSON parsing (`json.loads(request.body)`), data validation (checking for `code`, `isalpha`), object creation/deletion, and constructing `JsonResponse`.
*   This matches the existing approach used for the Owner API views.

**Alternative: Django REST Framework (DRF)**
*   **Overview:** DRF is the de-facto standard library for building robust web APIs in Django.
*   **Key Features:**
    *   **Serializers:** Define data representation (Model -> JSON) and validation.
    *   **Generic Views / ViewSets:** Pre-built views for common CRUD operations (e.g., `ListCreateAPIView`, `RetrieveUpdateDestroyAPIView`, `ModelViewSet`). Reduces boilerplate code significantly.
    *   **Routers:** Automatically generate URL patterns for ViewSets.
    *   **Authentication & Permissions:** Enhanced systems for API security.
    *   **Browsablqe API:** A user-friendly interface for interacting with the API directly in the browser.

**Decision (Current): Stick with Standard Django Views**
*   **Reasoning:**
    *   The current API needs are relatively simple and well-handled by the standard views.
    *   Maintains consistency with the existing Owner API implementation.
    *   Avoids adding a new major dependency (DRF) and the associated learning curve at this stage.
*   **Future Consideration:** If the API requirements grow significantly more complex (e.g., more nested resources, complex permissions, multiple serialization formats), refactoring to DRF would be a worthwhile investment.

## Frontend Structure (Owner List Page)

**Context:** The `owner_list.html` template initially contained a large inline `<script>` block for the Vue app and the HTML definitions for multiple modals (Create/Edit, View, Delete).

**Improvements Made:**
*   The JavaScript logic for the `ownerApp` was extracted into a separate static file (`static/js/owner_list.js`).
*   Configuration (URLs, CSRF token) is passed from the Django template to the JavaScript via `data-*` attributes.

**Future Considerations:**
*   **Modal Includes:** Considered splitting modal HTML into separate partials using `{% include %}`. Decided against it for now as it offers limited benefit without separating the controlling logic (which remains in the main Vue app).
*   **Vue Components:** A more robust future refactoring would be to convert the modals (and potentially other UI sections like filters or pagination) into dedicated Vue components.
    *   **Pros:** Better encapsulation (template, script, style per component), improved reusability, cleaner main template (`owner_list.html` would use `<owner-modal>...</owner-modal>` tags).
    *   **Cons:** Requires deeper Vue knowledge (props, events), might necessitate a JavaScript build step if using Single File Components (`.vue` files).
    *   **Decision:** Keep this as a potential future improvement if frontend complexity increases significantly. 

## JavaScript Dependencies (Vue vs Axios)

- **Observation:** Both `owner_list.html` (via `static/js/owner_list.js`) and `manage.html` (inline script) use Vue.js and Axios.
- **Analysis:**
    - Vue.js is essential for the current dynamic UI implementation (rendering, state management, event handling).
    - Axios is used only for making AJAX calls to the backend API and can be replaced by the native browser `fetch` API.
- **Action:** Consider refactoring API calls to use `fetch` instead of Axios in the future to reduce dependencies. This would require modifying the JavaScript logic in both `owner_list.js` and the `manage.html` template script. 

## Vue Delimiter Issue in OwnerCreateEditModal

- **Problem**: The `OwnerCreateEditModal` component (`static/js/components/OwnerCreateEditModal.js`) was displaying literal `[[ modalTitle ]]` and `[[ isSaving ? 'Saving...' : 'Save' ]]` instead of the interpolated values.
- **Investigation**: 
    - Checked the main Vue app initialization in `static/js/owner_list.js` and confirmed `delimiters: ['[[', ']]']` was correctly set.
    - No console errors were present.
    - Temporarily changed delimiters in the component's template to `{{ }}` for diagnosis.
- **Resolution**: Changing the delimiters in the component's template string to the default `{{ }}` fixed the rendering. The global `delimiters` setting was not being applied to this specific component's template string, possibly due to how the component object literal's template is processed.
- **Solution**: Updated the `OwnerCreateEditModal.js` template to consistently use `{{ }}` for all interpolations. 