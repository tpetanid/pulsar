const manageApp = Vue.createApp({
    data() {
        return {
            // Config Data (will be read from DOM)
            csrfToken: '',
            templateDownloadUrl: '',
            ownerImportPreviewUrl: '',
            ownerImportExecuteUrl: '',
            speciesListCreateUrl: '',
            speciesDeleteUrlBase: '', // e.g., /api/species/
            breedListCreateUrl: '',
            breedDeleteUrlBase: '', // e.g., /api/breeds/

            // Import Modal State
            isImportModalOpen: false,
            importFile: null,
            validationErrors: [],
            previewData: [],
            totalRecords: 0,
            previewHeaders: [],
            isProcessingImport: false,
            importSuccess: null,
            importMessage: '',
            importedCount: 0,
            skippedCount: 0,
            skippedRowsInfo: [],

            // Notification State
            notification: {
                message: null,
                type: 'success',
                timeoutId: null // To clear timeout if new notification comes
            },

            // Species Modal State
            isSpeciesModalOpen: false,
            speciesList: [], // Holds {code: '... '}
            newSpeciesCode: '',
            speciesLoading: false,
            speciesError: null,

            // Breed Modal State
            isBreedsModalOpen: false,
            selectedBreedSpecies: '',
            newBreedName: '',
            breedsLoading: false,
            breedError: null,
            breedsList: [],
            breedSearchQuery: '',
            isBreedFilterActive: false,
            breedSearchDebounceMs: 300, // Not currently used for debouncing, but kept for potential future use
            breedsPagination: {
                total_breeds: 0,
                total_pages: 1,
                page: 1,
                per_page: 25,
                has_previous: false,
                has_next: false
            }
        };
    },
    delimiters: ['[[', ']]'],
    computed: {
        // templateDownloadUrl computed property is removed as it's now read from config

        canImport() {
            return this.importFile && this.validationErrors.length === 0 && !this.isProcessingImport;
        },
         requiredFields() {
             // This doesn't depend on config, keep as is
             return [
                 { name: 'last_name', type: 'Text', required: true },
                 { name: 'first_name', type: 'Text', required: false },
                 { name: 'email', type: 'Email', required: false },
                 { name: 'telephone', type: 'Text', required: false },
                 { name: 'address', type: 'Text', required: false },
                 { name: 'comments', type: 'Text', required: false },
                 { name: 'created_at', type: 'DateTime (YYYY-MM-DD HH:MM:SS)', required: false },
             ];
        },
    },
    methods: {
        readConfig() {
            const appElement = document.getElementById('manage-app');
            if (appElement && appElement.dataset) {
                this.csrfToken = appElement.dataset.csrfToken;
                this.templateDownloadUrl = appElement.dataset.ownerImportTemplateUrl;
                this.ownerImportPreviewUrl = appElement.dataset.ownerImportPreviewUrl;
                this.ownerImportExecuteUrl = appElement.dataset.ownerImportExecuteUrl;
                this.speciesListCreateUrl = appElement.dataset.speciesListCreateUrl;
                this.speciesDeleteUrlBase = appElement.dataset.speciesDeleteUrlBase; // Base URL only
                this.breedListCreateUrl = appElement.dataset.breedListCreateUrl;
                this.breedDeleteUrlBase = appElement.dataset.breedDeleteUrlBase; // Base URL only

                // Basic check if URLs seem loaded
                if (!this.csrfToken || !this.templateDownloadUrl || !this.ownerImportPreviewUrl || !this.ownerImportExecuteUrl || !this.speciesListCreateUrl || !this.speciesDeleteUrlBase || !this.breedListCreateUrl || !this.breedDeleteUrlBase) {
                     console.warn("Manage App: Some config URLs might be missing from data attributes.");
                }
            } else {
                console.error("Manage App: Could not read config from #manage-app data attributes.");
                // Optionally display an error to the user
                 this.showNotification("Initialization Error: Could not load page configuration.", 'error', 0);
            }
        },

        // --- Notification Methods ---
        showNotification(message, type = 'success', duration = 5000) {
             this.notification.message = message;
             this.notification.type = type;
             if (this.notification.timeoutId) {
                 clearTimeout(this.notification.timeoutId);
             }
             if (duration > 0) {
                 this.notification.timeoutId = setTimeout(() => this.clearNotification(), duration);
             } else {
                 this.notification.timeoutId = null;
             }
        },
        clearNotification() {
            this.notification.message = null;
            if (this.notification.timeoutId) {
                clearTimeout(this.notification.timeoutId);
                this.notification.timeoutId = null;
            }
        },

        // --- Owner Import Methods ---
         openImportModal() {
            this.isImportModalOpen = true;
            this.importFile = null;
            this.validationErrors = [];
            this.previewData = [];
            this.totalRecords = 0;
            this.previewHeaders = [];
            this.importSuccess = null;
            this.importMessage = '';
            this.importedCount = 0;
            this.skippedCount = 0;
            this.skippedRowsInfo = [];
            this.clearNotification();
            const fileInput = document.getElementById('file-upload');
            if (fileInput) fileInput.value = '';
            this.$nextTick(() => {
                const focusable = this.$refs.importModal?.querySelector('#file-upload, button');
                if (focusable) focusable.focus();
            });
        },
        closeModal() { // Generic close, handles import modal currently
            this.isImportModalOpen = false;
            // Reset import specific state if needed, or rely on openImportModal
        },
        handleFileChange(event) {
             const fileInput = event.target;
             this.importFile = fileInput.files[0];
             this.validationErrors = [];
             this.previewData = [];
             this.totalRecords = 0;
             this.previewHeaders = [];
             this.importSuccess = null;
             this.importMessage = '';
             this.clearNotification();
             if (this.importFile) {
                 this.validateAndPreviewFile();
             } else {
                this.previewData = [];
                this.previewHeaders = [];
                this.totalRecords = 0;
             }
        },
        validateAndPreviewFile() {
            if (!this.importFile) return;
            if (this.importFile.type !== 'text/csv' && !this.importFile.name.toLowerCase().endsWith('.csv')) {
                this.validationErrors = ['Invalid file type. Please upload a CSV file.'];
                this.importFile = null;
                const fileInput = document.getElementById('file-upload');
                if(fileInput) fileInput.value = '';
                return;
            }
            this.isProcessingImport = true;
            this.validationErrors = [];
            this.previewData = [];
            this.totalRecords = 0;
            this.previewHeaders = [];
            let formData = new FormData();
            formData.append('file', this.importFile);
            axios.post(this.ownerImportPreviewUrl, formData, { // Use config URL
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'X-CSRFToken': this.csrfToken // Use config CSRF token
                }
            })
            .then(response => {
                if (response.data.success && response.data.preview && response.data.preview.headers && response.data.preview.rows) {
                    this.previewHeaders = response.data.preview.headers;
                    this.previewData = response.data.preview.rows;
                    this.totalRecords = response.data.total_records || 0;
                } else {
                    this.validationErrors = response.data.errors || response.data.error ? (Array.isArray(response.data.errors) ? response.data.errors : [response.data.error || 'Preview failed.']) : ['Unknown preview error.'];
                    this.importFile = null;
                    const fileInput = document.getElementById('file-upload');
                    if(fileInput) fileInput.value = '';
                }
            })
            .catch(error => {
                console.error("Preview Error:", error);
                let msg = 'An unexpected error occurred during preview.';
                if (error.response && error.response.data && (error.response.data.error || error.response.data.errors)) {
                     const backendError = error.response.data.error || (Array.isArray(error.response.data.errors) ? error.response.data.errors.join('; ') : 'Preview failed.');
                     msg = `Preview Error: ${backendError}`;
                }
                this.validationErrors = [msg];
                this.importFile = null;
                const fileInput = document.getElementById('file-upload');
                if (fileInput) fileInput.value = '';
            })
            .finally(() => {
                this.isProcessingImport = false;
            });
        },
        confirmImport() {
            if (!this.canImport) return;
            this.isProcessingImport = true;
            this.importSuccess = null;
            this.importMessage = '';
            this.clearNotification();
            let formData = new FormData();
            formData.append('file', this.importFile);
            axios.post(this.ownerImportExecuteUrl, formData, { // Use config URL
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'X-CSRFToken': this.csrfToken // Use config CSRF token
                }
            })
            .then(response => {
                if (response.data.success) {
                    this.importSuccess = true;
                    this.importedCount = response.data.imported_count;
                    this.skippedCount = response.data.skipped_count;
                    let message = response.data.message || `Successfully imported ${this.importedCount} owners.`;
                     if (response.data.skipped_count > 0 && !message.toLowerCase().includes('skipped')) {
                         message += ` Skipped ${response.data.skipped_count} rows (duplicates/errors).`;
                     }
                    this.showNotification(message, 'success');
                    this.closeModal();
                } else {
                    this.importSuccess = false;
                    let errorMsg = response.data.error || 'Import failed due to errors.';
                     this.validationErrors = response.data.error ? [response.data.error] : (response.data.errors || ['Import failed.']);
                     this.showNotification(errorMsg, 'error', 0); // Show error in modal and banner
                }
            })
            .catch(error => {
                console.error("Import Execute Error:", error);
                this.importSuccess = false;
                let errorMsg = 'An unexpected error occurred during import.';
                if (error.response && error.response.data && (error.response.data.error || error.response.data.errors)) {
                     errorMsg = error.response.data.error || (Array.isArray(error.response.data.errors) ? error.response.data.errors.join('; ') : 'Import failed.');
                }
                this.validationErrors = [errorMsg]; // Show error in modal
                this.showNotification(errorMsg, 'error', 0); // Also show in banner
            })
            .finally(() => {
                this.isProcessingImport = false;
            });
        },

        // --- Species Management Methods ---
        openSpeciesModal() {
            this.isSpeciesModalOpen = true;
            this.newSpeciesCode = '';
            this.speciesError = null;
            this.clearNotification();
            // Always fetch fresh species list when opening
            this.fetchSpecies();
            this.$nextTick(() => {
                this.$refs.newSpeciesInput?.focus();
            });
        },
        closeSpeciesModal() {
            this.isSpeciesModalOpen = false;
        },
        fetchSpecies() {
            this.speciesLoading = true;
            this.speciesError = null;
            axios.get(this.speciesListCreateUrl) // Use config URL
                .then(response => {
                    this.speciesList = response.data.sort((a, b) => a.code.localeCompare(b.code));
                })
                .catch(error => {
                    console.error("Error fetching species:", error);
                    this.speciesError = "Failed to load species list.";
                    this.showNotification("Failed to load species list.", 'error');
                })
                .finally(() => {
                    this.speciesLoading = false;
                });
        },
        addSpecies() {
            if (!this.newSpeciesCode || this.speciesLoading) return;
            const codeToAdd = this.newSpeciesCode.toUpperCase();
            if (!/^[A-Z]+$/.test(codeToAdd)) {
                this.speciesError = "Species code must contain only uppercase letters (A-Z).";
                return;
            }
            this.speciesLoading = true;
            this.speciesError = null;
            this.clearNotification();
            axios.post(this.speciesListCreateUrl, { code: codeToAdd }, { // Use config URL
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.csrfToken // Use config CSRF token
                }
            })
            .then(response => {
                this.speciesList.push(response.data);
                this.speciesList.sort((a, b) => a.code.localeCompare(b.code));
                this.newSpeciesCode = '';
                this.showNotification(`Species "${codeToAdd}" added successfully.`, 'success');
                this.$refs.newSpeciesInput?.focus(); // Keep focus for adding more
            })
            .catch(error => {
                console.error("Error adding species:", error);
                let errorMsg = 'Failed to add species.';
                if (error.response && error.response.data && (error.response.data.error || error.response.data.detail)) {
                    errorMsg = error.response.data.error || error.response.data.detail; // Handle DRF detail error
                } else if (error.response && error.response.data && error.response.data.code) {
                    // Handle specific validation errors if backend sends them like { code: ["error message"] }
                     errorMsg = `Code: ${error.response.data.code.join(', ')}`;
                }
                this.speciesError = errorMsg; // Show error in modal
            })
            .finally(() => {
                this.speciesLoading = false;
            });
        },
        deleteSpecies(codeToDelete) {
            if (!confirm(`Are you sure you want to delete the species "${codeToDelete}"? Note: Deletion will fail if breeds are associated with it.`)) {
                return;
            }
            this.speciesLoading = true;
            this.speciesError = null;
            this.clearNotification();
            // Construct URL using base + code
            const deleteUrl = `${this.speciesDeleteUrlBase}${encodeURIComponent(codeToDelete)}/`;
            axios.delete(deleteUrl, { headers: { 'X-CSRFToken': this.csrfToken } }) // Use config CSRF
            .then(response => {
                this.speciesList = this.speciesList.filter(s => s.code !== codeToDelete);
                this.showNotification(response.data.message || `Species "${codeToDelete}" deleted.`, 'success');
                // If the deleted species was selected in the breeds modal, clear selection/data
                if (this.selectedBreedSpecies === codeToDelete) {
                   this.selectedBreedSpecies = ''; // Clear selection
                   this.breedsList = []; // Clear breeds list
                   this.breedsPagination = { ...this.breedsPagination, total_breeds: 0, total_pages: 1, page: 1, has_previous: false, has_next: false };
                }
            })
            .catch(error => {
                console.error("Error deleting species:", error);
                let errorMsg = 'Failed to delete species.';
                 if (error.response && error.response.data && (error.response.data.error || error.response.data.detail)) {
                    errorMsg = error.response.data.error || error.response.data.detail; // Handle DRF detail error
                }
                this.showNotification(errorMsg, 'error'); // Show error in banner
            })
            .finally(() => {
                this.speciesLoading = false;
            });
        },

        // --- Breed Management Methods ---
        openBreedsModal() {
            this.isBreedsModalOpen = true;
            this.newBreedName = '';
            this.breedError = null;
            this.breedSearchQuery = '';
            this.isBreedFilterActive = false;
            this.breedsPagination = { ...this.breedsPagination, page: 1, total_pages: 1, total_breeds: 0 };
            this.breedsList = [];
            this.clearNotification();

            // Fetch species if needed (or rely on initial fetch)
            if (this.speciesList.length === 0) {
                this.fetchSpecies().then(() => { // Fetch and then proceed
                    this.setDefaultBreedSpeciesAndFetchBreeds();
                });
            } else {
                this.speciesLoading = false;
                this.setDefaultBreedSpeciesAndFetchBreeds();
            }

            this.$nextTick(() => {
                 this.$refs.newBreedInput?.focus();
            });
        },
        setDefaultBreedSpeciesAndFetchBreeds() {
             const defaultSpecies = this.speciesList.find(s => s.code === 'DOG') ? 'DOG' : (this.speciesList.length > 0 ? this.speciesList[0].code : '');
             this.selectedBreedSpecies = defaultSpecies;
             if (this.selectedBreedSpecies) {
                 this.fetchBreeds();
             } else {
                  this.breedsLoading = false; // Ensure loading stops if no species selected
             }
        },
        closeBreedsModal() {
            this.isBreedsModalOpen = false;
        },
        fetchBreeds() {
             if (!this.selectedBreedSpecies) {
                 this.breedsList = [];
                 this.breedsPagination = { ...this.breedsPagination, total_breeds: 0, total_pages: 1, page: 1, has_previous: false, has_next: false };
                 this.breedsLoading = false;
                 return;
             }
             this.breedsLoading = true;
             this.breedError = null;
             const params = {
                 species_code: this.selectedBreedSpecies,
                 page: this.breedsPagination.page,
                 per_page: this.breedsPagination.per_page,
                 search: this.breedSearchQuery // Send search query if present
             };
             axios.get(this.breedListCreateUrl, { params }) // Use config URL
             .then(response => {
                 // Assuming backend sends pagination data directly in the response root now
                 if (response.data && response.data.results) {
                     this.breedsList = response.data.results;
                     this.breedsPagination = { // Update fully from response
                        total_breeds: response.data.count || 0, // Use 'count' if available
                        total_pages: response.data.total_pages || 1, // Use 'total_pages'
                        page: response.data.page || 1, // Use 'page'
                        per_page: response.data.per_page || 25, // Use 'per_page'
                        has_previous: !!response.data.previous, // Check if 'previous' URL exists
                        has_next: !!response.data.next, // Check if 'next' URL exists
                        // Add calculated fields if needed, though DRF usually provides them
                     };
                 } else {
                      // Handle cases where data structure might be different or success flag is used
                      let errorMsg = 'Failed to load breeds (unexpected response format).';
                      if (response.data && response.data.error) {
                          errorMsg = response.data.error;
                      }
                      this.showNotification(errorMsg, 'error');
                      this.breedsList = [];
                      this.breedsPagination = { ...this.breedsPagination, total_breeds: 0, total_pages: 1, page: 1, has_previous: false, has_next: false };
                 }
             })
             .catch(error => {
                 console.error("Error fetching breeds:", error);
                 this.showNotification("An error occurred while fetching breeds.", 'error');
                 this.breedsList = [];
                 this.breedsPagination = { ...this.breedsPagination, total_breeds: 0, total_pages: 1, page: 1, has_previous: false, has_next: false };
             })
             .finally(() => {
                 this.breedsLoading = false;
             });
        },
        addBreed() {
            if (!this.newBreedName || this.breedsLoading || !this.selectedBreedSpecies) return;
            const nameToAdd = this.newBreedName;
            this.breedsLoading = true;
            this.breedError = null;
            this.clearNotification();
            axios.post(this.breedListCreateUrl, { // Use config URL
                name: nameToAdd,
                species_code: this.selectedBreedSpecies
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.csrfToken // Use config CSRF token
                }
            })
            .then(response => {
                 this.newBreedName = '';
                 this.showNotification(`Breed "${nameToAdd}" added successfully.`, 'success');
                 // Refresh current page of breeds
                 this.fetchBreeds();
                 this.$refs.newBreedInput?.focus(); // Keep focus for adding more
            })
            .catch(error => {
                console.error("Error adding breed:", error);
                let errorMsg = 'Failed to add breed.';
                 if (error.response && error.response.data) {
                     // Check for DRF validation errors (often in 'name' or 'non_field_errors')
                     if (error.response.data.name) {
                         errorMsg = `Name: ${error.response.data.name.join(', ')}`;
                     } else if (error.response.data.non_field_errors) {
                          errorMsg = error.response.data.non_field_errors.join(', ');
                     } else if (error.response.data.error) {
                         errorMsg = error.response.data.error;
                     } else if (error.response.data.detail) {
                         errorMsg = error.response.data.detail;
                     }
                 }
                this.breedError = errorMsg; // Show error in modal
            })
            .finally(() => {
                this.breedsLoading = false;
            });
        },
        deleteBreed(breedId, breedName) {
            if (!confirm(`Are you sure you want to delete the breed "${breedName}"?`)) {
                return;
            }
            this.breedsLoading = true;
            this.breedError = null;
            this.clearNotification();
             // Construct URL using base + ID
             const deleteUrl = `${this.breedDeleteUrlBase}${breedId}/`;
            axios.delete(deleteUrl, { headers: { 'X-CSRFToken': this.csrfToken } }) // Use config CSRF
            .then(response => {
                this.showNotification(response.data.message || `Breed "${breedName}" deleted.`, 'success');
                 // If the deleted item was the last one on the current page, and it's not page 1, go back
                 if (this.breedsList.length === 1 && this.breedsPagination.page > 1) {
                     this.breedsPagination.page -= 1;
                 }
                 this.fetchBreeds(); // Refresh the list
            })
            .catch(error => {
                console.error("Error deleting breed:", error);
                let errorMsg = 'Failed to delete breed.';
                 if (error.response && error.response.data && (error.response.data.error || error.response.data.detail)) {
                    errorMsg = error.response.data.error || error.response.data.detail;
                }
                 this.showNotification(errorMsg, 'error'); // Show error in banner
            })
            .finally(() => {
                this.breedsLoading = false;
            });
        },
        handleSpeciesChange() {
             this.breedsPagination.page = 1; // Reset page
             this.breedSearchQuery = ''; // Clear search
             this.isBreedFilterActive = false;
             this.fetchBreeds(); // Fetch breeds for newly selected species
        },
        applyBreedSearch() {
            this.breedsPagination.page = 1; // Reset page when searching
            this.isBreedFilterActive = !!this.breedSearchQuery; // Mark filter as active if query exists
            this.fetchBreeds();
        },
        clearBreedSearch() {
            if (this.breedSearchQuery || this.isBreedFilterActive) {
                this.breedSearchQuery = '';
                this.isBreedFilterActive = false;
                this.applyBreedSearch(); // Re-fetch without search term (effectively clears)
            }
        },
        goToBreedPage(page) {
            if (page >= 1 && page <= this.breedsPagination.total_pages && page !== this.breedsPagination.page) {
                this.breedsPagination.page = page;
                this.fetchBreeds();
            }
        }
    },
    mounted() {
        this.readConfig(); // Read config from data attributes first
        // Check if config seems loaded before initial fetch
        if (this.speciesListCreateUrl && this.csrfToken) {
             this.fetchSpecies(); // Fetch initial species list for dropdowns
        } else {
            console.error("Manage App initialization failed: Missing essential config (CSRF Token or Species URL).");
             this.showNotification("Page initialization failed. Please refresh.", 'error', 0);
             // Prevent further loading if config is missing
             this.speciesLoading = false;
             this.breedsLoading = false;
        }

        // Add global keydown listener if needed (e.g., for Esc key to close modals)
        // Consider scoping this if multiple Vue apps are on the same page in the future
         window.addEventListener('keydown', (event) => {
             if (event.key === 'Escape') {
                 if (this.isImportModalOpen) this.closeModal();
                 if (this.isSpeciesModalOpen) this.closeSpeciesModal();
                 if (this.isBreedsModalOpen) this.closeBreedsModal();
             }
         });
    },
     beforeUnmount() {
         // Clean up global event listeners if added
         // window.removeEventListener('keydown', ...); // Add the specific listener function reference here
     }
});

manageApp.mount('#manage-app'); 