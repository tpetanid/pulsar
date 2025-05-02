const ownerApp = Vue.createApp({
    // Register the component
    components: {
        'owner-create-edit-modal': OwnerCreateEditModal
    },
    data() {
        return {
            owners: [],
            isLoading: true,
            isDeleting: false,
            // Pagination state
            currentPage: 1,
            perPage: 20, // Default per page
            totalPages: 1,
            totalOwners: 0,
            hasPreviousPage: false,
            hasNextPage: false,
            // Modals state
            showDeleteModal: false,
            showViewModal: false,
            currentOwner: {}, // For Delete/View modals
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
            // Sort state
            sortField: 'updated_at', // Default sort field
            sortDirection: 'desc', // Default sort direction ('asc' or 'desc')
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
        formatDate(isoString) {
            if (!isoString) return '';
            try {
                // Display date and time, e.g., "YYYY-MM-DD HH:MM"
                const date = new Date(isoString);
                 if (isNaN(date.getTime())) {
                     throw new Error("Invalid Date"); // Handle invalid date strings
                 }
                const formattedDate = date.toISOString().split('T')[0];
                const hours = date.getHours().toString().padStart(2, '0');
                const minutes = date.getMinutes().toString().padStart(2, '0');
                return `${formattedDate} ${hours}:${minutes}`;
            } catch (e) {
                console.error("Error formatting date:", isoString, e);
                return isoString; // Return original string on error
            }
        },
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
                sort: this.sortField,
                direction: this.sortDirection
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
         changeSort(field) {
             if (this.sortField === field) {
                 // Toggle direction if clicking the same field
                 this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
             } else {
                 // Default to ascending for a new field
                 this.sortField = field;
                 this.sortDirection = 'asc';
             }
             this.fetchPaginatedOwners(); // Re-fetch data with new sorting
         },
        openCreateModal() {
            this.$refs.createEditModal.openModal(); // Call component's method
        },
        openEditModal(owner) {
             this.$refs.createEditModal.openModal(owner); // Pass owner data to component
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
        openEditFromViewModal() {
            const ownerToEdit = this.currentOwner;
            this.closeModal(); // Close the view modal
            this.$nextTick(() => {
                // Call the component's openModal method for editing
               if (ownerToEdit && ownerToEdit.id) {
                   this.openEditModal(ownerToEdit); // This now calls the ref
               } else {
                   console.error("Cannot open edit modal: current owner data is missing or invalid.");
                }
           });
        },
        closeModal(event) {
             // Close only Delete and View modals if backdrop is clicked
             // The create/edit modal handles its own closing via internal methods
             if (!event || event.target === event.currentTarget) {
                 this.showDeleteModal = false;
                 this.showViewModal = false;
                 this.currentOwner = {}; // Clear current owner for view/delete
             }
             // Note: Don't reset the create/edit form here
         },
        handleOwnerSaved(savedOwnerData) {
            console.log("Owner saved event received:", savedOwnerData);
            // Refresh the owner list to show the new/updated data
            this.fetchPaginatedOwners();
            // Optional: Show a success notification here
        },
        focusAddButtonMaybe() {
            // Optional: Refocus the 'Add New Owner' button after modal closes for better flow
            this.$nextTick(() => {
                 this.$refs.addButton?.focus();
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
        // Modify event listener: Component handles its own Escape key
         window.addEventListener('keydown', (event) => {
             if (event.key === 'Escape') {
                 // Only close Delete/View modals from the main app listener
                 if (this.showDeleteModal || this.showViewModal) {
                    this.closeModal();
                 }
             }
         });
    },
     beforeUnmount() {
         // Clean up event listener when the component is destroyed
         // Need to store the listener function reference to remove it correctly
         // window.removeEventListener('keydown', this.globalKeydownListener); 
     }
});

// Mount the app AFTER defining components it uses
ownerApp.mount('#owner-app'); 