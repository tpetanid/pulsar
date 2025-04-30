const ownerApp = Vue.createApp({
    data() {
        return {
            owners: [],
            isLoading: true,
            isSaving: false,
            isDeleting: false,
            // Pagination state
            currentPage: 1,
            perPage: 20, // Default per page
            totalPages: 1,
            totalOwners: 0,
            hasPreviousPage: false,
            hasNextPage: false,
            // Modals state
            showCreateEditModal: false,
            showDeleteModal: false,
            showViewModal: false,
            isEditMode: false,
            currentOwner: {}, // For Delete/View modals
            ownerForm: { // For Create/Edit modal
                id: null,
                last_name: '',
                first_name: '',
                email: '',
                telephone: '',
                address: '',
                comments: '',
            },
            formErrors: {}, // To display validation errors
            // Filter state
            showFilters: false,
            searchQuery: '',
            filterFields: [ // Available fields for filtering
                 { label: 'Last Name', value: 'last_name' },
                 { label: 'First Name', value: 'first_name' },
                 { label: 'Email', value: 'email' },
                 { label: 'Telephone', value: 'telephone' },
                 { label: 'Address', value: 'address' },
                 { label: 'Comments', value: 'comments' },
            ],
            selectedFilterFields: ['last_name', 'first_name', 'email', 'telephone', 'address', 'comments'], // Default selected fields
            // URLs and CSRF Token will be read from data attributes
            listApiUrl: '',
            createApiUrl: '',
            detailApiUrlBase: '', // Base URL, pk appended later
            updateApiUrlBase: '', // Base URL, pk appended later
            deleteApiUrlBase: '', // Base URL, pk appended later
            csrfToken: '',
        };
    },
    delimiters: ['[[', ']]'], // Use different delimiters if needed
    computed: {
        modalTitle() {
            return this.isEditMode ? 'Edit Owner' : 'Add New Owner';
        },
        firstOwnerIndex() {
            if (this.totalOwners === 0) return 0;
            return (this.currentPage - 1) * this.perPage + 1;
        },
        lastOwnerIndex() {
            const last = this.currentPage * this.perPage;
            return last > this.totalOwners ? this.totalOwners : last;
        }
    },
    methods: {
         readConfig() {
            const appElement = document.getElementById('owner-app');
            if (appElement && appElement.dataset) {
                this.csrfToken = appElement.dataset.csrfToken;
                this.listApiUrl = appElement.dataset.listApiUrl;
                this.createApiUrl = appElement.dataset.createApiUrl;
                this.detailApiUrlBase = appElement.dataset.detailApiUrlBase;
                this.updateApiUrlBase = appElement.dataset.updateApiUrlBase;
                this.deleteApiUrlBase = appElement.dataset.deleteApiUrlBase;
            } else {
                console.error("Could not read config from #owner-app data attributes.");
            }
        },
        fetchPaginatedOwners() {
            this.isLoading = true;
            const params = new URLSearchParams({
                page: this.currentPage,
                per_page: this.perPage,
                query: this.searchQuery,
            });
            // Add selected filter fields to params
            this.selectedFilterFields.forEach(field => {
                 params.append('filter_fields', field);
             });

            // Construct the full URL with query parameters
            const url = `${this.listApiUrl}?${params.toString()}`;

            axios.get(url)
                .then(response => {
                    if (response.data.success) {
                        this.owners = response.data.results;
                        this.currentPage = response.data.page;
                        this.totalPages = response.data.total_pages;
                        this.totalOwners = response.data.total_owners;
                        this.perPage = response.data.per_page; // Update in case backend adjusted it
                        this.hasPreviousPage = response.data.has_previous;
                        this.hasNextPage = response.data.has_next;
                    } else {
                         console.error("API Error:", response.data.error);
                         // Handle error display to user if needed
                    }
                })
                .catch(error => {
                    console.error("Error fetching owners:", error);
                    // Handle network error display
                })
                .finally(() => {
                    this.isLoading = false;
                });
        },
        goToPage(page) {
            if (page >= 1 && page <= this.totalPages) {
                this.currentPage = page;
                this.fetchPaginatedOwners();
            }
        },
         changePerPage() {
             // Reset to page 1 when changing items per page
             this.currentPage = 1;
             this.fetchPaginatedOwners();
         },
         applyFilters() {
             this.currentPage = 1; // Reset to page 1 when applying filters
             this.fetchPaginatedOwners();
         },
         clearFilters() {
            this.searchQuery = '';
            // Reset selected fields to all fields
            this.selectedFilterFields = this.filterFields.map(f => f.value);
            this.applyFilters(); // Re-fetch with cleared filters
         },
          toggleFilters() {
             this.showFilters = !this.showFilters;
         },
        resetForm() {
            this.ownerForm = { id: null, last_name: '', first_name: '', email: '', telephone: '', address: '', comments: '' };
            this.formErrors = {};
        },
        openCreateModal() {
            this.resetForm();
            this.isEditMode = false;
            this.showCreateEditModal = true;
            this.$nextTick(() => {
                // Focus first input element for accessibility
                const firstInput = this.$refs.createEditModal?.querySelector('input, textarea');
                 if (firstInput) firstInput.focus();
            });
        },
        openEditModal(owner) {
             this.resetForm();
             this.isEditMode = true;
             // Fetch full details in case list view doesn't have everything (like comments/address)
             // Or, if list view HAS everything, just populate directly:
             // this.ownerForm = { ...owner }; // Shallow copy
             // Fetching full details is safer if list view is optimized
             const detailUrl = this.detailApiUrlBase.replace('/0/', `/${owner.id}/`); // Replace placeholder
             axios.get(detailUrl)
                 .then(response => {
                     // Check if response is the owner object directly
                     if (response.data && response.data.id) {
                         this.ownerForm = response.data;
                         this.showCreateEditModal = true;
                          this.$nextTick(() => {
                            const firstInput = this.$refs.createEditModal?.querySelector('input, textarea');
                            if (firstInput) firstInput.focus();
                        });
                     } else {
                          console.error("Error: Invalid owner data received", response.data);
                     }
                 })
                 .catch(error => {
                      console.error("Error fetching owner details:", error);
                      alert("Failed to load owner details for editing."); // Simple user feedback
                 });
         },
        openDeleteModal(owner) {
            this.currentOwner = owner;
            this.showDeleteModal = true;
             this.$nextTick(() => {
                 // Focus the confirmation button
                const confirmButton = this.$refs.deleteModal?.querySelector('button[class*="bg-red-500"]');
                 if (confirmButton) confirmButton.focus();
            });
        },
         openViewModal(owner) {
             // Fetch full details similarly to edit, or use provided data if complete
             const detailUrl = this.detailApiUrlBase.replace('/0/', `/${owner.id}/`);
             axios.get(detailUrl)
                 .then(response => {
                     if (response.data && response.data.id) {
                         this.currentOwner = response.data; // Populate currentOwner with full details
                         this.showViewModal = true;
                          this.$nextTick(() => {
                             const closeButton = this.$refs.viewModal?.querySelector('button');
                             if (closeButton) closeButton.focus();
                         });
                     } else {
                         console.error("Error: Invalid owner data received for view", response.data);
                     }
                 })
                 .catch(error => {
                      console.error("Error fetching owner details for view:", error);
                      alert("Failed to load owner details for viewing.");
                 });
         },
        closeModal(event) {
             // Close any modal if backdrop is clicked (event.target === event.currentTarget)
             // or if called directly without event (e.g., from button)
             if (!event || event.target === event.currentTarget) {
                 this.showCreateEditModal = false;
                 this.showDeleteModal = false;
                 this.showViewModal = false;
                 this.resetForm(); // Clear form data when closing
                 this.currentOwner = {}; // Clear current owner
             }
         },
        saveOwner() {
            this.isSaving = true;
            this.formErrors = {}; // Clear previous errors
            let url = this.createApiUrl;
            let method = 'post';

            if (this.isEditMode && this.ownerForm.id) {
                 url = this.updateApiUrlBase.replace('/0/', `/${this.ownerForm.id}/`);
                // Method remains 'post' as the backend view handles update on POST
                // If backend used PUT: method = 'put';
            }

            axios({
                method: method,
                url: url,
                data: this.ownerForm,
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.csrfToken
                }
            })
            .then(response => {
                if (response.data.success) {
                    this.closeModal();
                    this.fetchPaginatedOwners(); // Refresh the list
                    // Optionally show success notification
                } else if (response.data.errors) {
                     // This case is handled by the catch block for 400 status
                     // console.error("Validation Errors:", response.data.errors);
                     // this.formErrors = response.data.errors;
                }
            })
            .catch(error => {
                if (error.response && error.response.status === 400 && error.response.data.errors) {
                    // Handle validation errors from Django form
                    this.formErrors = error.response.data.errors;
                    console.error("Validation Errors:", this.formErrors);
                } else {
                    console.error("Error saving owner:", error);
                    // Display a generic error message?
                     this.formErrors = { non_field_errors: ['An unexpected error occurred. Please try again.'] };
                }
            })
            .finally(() => {
                this.isSaving = false;
            });
        },
        deleteOwnerConfirm() {
            this.isDeleting = true;
             const deleteUrl = this.deleteApiUrlBase.replace('/0/', `/${this.currentOwner.id}/`);

            axios.post(deleteUrl, {}, { // Send POST request as per backend view
                headers: { 'X-CSRFToken': this.csrfToken }
            })
            .then(response => {
                if (response.data.success) {
                    this.closeModal();
                     // If the deleted owner was the last one on the current page, go back one page
                     if (this.owners.length === 1 && this.currentPage > 1) {
                         this.currentPage -= 1;
                     }
                    this.fetchPaginatedOwners(); // Refresh the list
                     // Optionally show success notification
                } else {
                    console.error("Error deleting owner (API):", response.data.error);
                    alert(`Error: ${response.data.error || 'Could not delete owner.'}`); // Simple feedback
                }
            })
            .catch(error => {
                console.error("Error deleting owner (Network/Server):", error);
                 alert("An unexpected error occurred while deleting the owner.");
            })
            .finally(() => {
                this.isDeleting = false;
            });
        }
    },
    mounted() {
         this.readConfig(); // Read config from data attributes
         if (this.listApiUrl && this.csrfToken) { // Check if config loaded
            this.fetchPaginatedOwners(); // Fetch initial data
         } else {
             console.error("App initialization failed: Missing config.");
             this.isLoading = false; // Stop loading indicator
             // Maybe display an error message to the user
         }
        // Add event listener for Escape key to close modals
         window.addEventListener('keydown', (event) => {
             if (event.key === 'Escape') {
                 if (this.showCreateEditModal || this.showDeleteModal || this.showViewModal) {
                    this.closeModal();
                 }
             }
         });
    },
     beforeUnmount() {
         // Clean up event listener when the component is destroyed
         window.removeEventListener('keydown', this.closeModal);
     }
});

ownerApp.mount('#owner-app'); 