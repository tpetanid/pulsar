const patientApp = Vue.createApp({
    components: {
        'patient-create-edit-modal': PatientCreateEditModal
    },
    data() {
        return {
            patients: [], // Changed from owners
            isLoading: true,
            isDeleting: false,
            // Pagination state
            currentPage: 1,
            perPage: 20, // Default per page
            totalPages: 1,
            totalPatients: 0, // Changed from totalOwners
            hasPreviousPage: false,
            hasNextPage: false,
            // Modals state
            showDeleteModal: false,
            showViewModal: false,
            currentPatient: {}, // Changed from currentOwner
            // Filter state
            showFilters: false,
            searchQuery: '',
            filterFields: [ // Available fields for filtering (adjust as needed)
                 { label: 'Patient Name', value: 'name' },
                 { label: 'Owner Last Name', value: 'owner__last_name' },
                 { label: 'Owner First Name', value: 'owner__first_name' },
                 { label: 'Species', value: 'species__code' },
                 { label: 'Breed', value: 'breed__name' },
                 //{ label: 'Sex', value: 'sex' }, // Maybe not useful for search?
            ],
            selectedFilterFields: ['name', 'owner__last_name', 'owner__first_name', 'species__code', 'breed__name'], // Default selected fields
            // Sort state
            sortField: 'updated_at', // Default sort field
            sortDirection: 'desc', // Default sort direction ('asc' or 'desc')
            // URLs and CSRF Token will be read from data attributes
            listApiUrl: '',
            createApiUrl: '',
            detailApiUrlBase: '', // Base URL, pk appended later
            updateApiUrlBase: '', // Base URL, pk appended later
            deleteApiUrlBase: '', // Base URL, pk appended later
            speciesListUrl: '',
            breedsBySpeciesUrlBase: '',
            ownerListUrl: '',
            csrfToken: '',
        };
    },
    delimiters: ['[[', ']]'], // Use different delimiters if needed
    computed: {
        firstPatientIndex() { // Changed
            if (this.totalPatients === 0) return 0;
            return (this.currentPage - 1) * this.perPage + 1;
        },
        lastPatientIndex() { // Changed
            const last = this.currentPage * this.perPage;
            return last > this.totalPatients ? this.totalPatients : last;
        },
    },
    methods: {
        formatDate(isoString) {
            if (!isoString) return '';
            // Handles both Date objects and ISO strings safely
            try {
                // Check if it looks like a date string 'YYYY-MM-DD'
                if (typeof isoString === 'string' && isoString.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    return isoString;
                }
                // Otherwise, assume it might have time component and extract date
                const date = new Date(isoString);
                if (isNaN(date.getTime())) return isoString; // Return original if invalid
                return date.toISOString().split('T')[0];
            } catch (e) {
                console.error("Error formatting date:", isoString, e);
                return isoString; // Return original string on error
            }
        },
        formatDateTime(isoString) {
            if (!isoString) return '';
            try {
                const date = new Date(isoString);
                if (isNaN(date.getTime())) return isoString;
                // Format as YYYY-MM-DD HH:MM
                return date.toISOString().replace('T', ' ').substring(0, 16);
            } catch (e) {
                 console.error("Error formatting datetime:", isoString, e);
                 return isoString;
            }
        },
        formatSex(sexCode) {
            if (sexCode === 'M') return 'Male';
            if (sexCode === 'F') return 'Female';
            return sexCode || ''; // Return code or empty string if null/undefined
        },
        formatIntact(isIntact) {
            if (typeof isIntact === 'boolean') {
                 return isIntact ? 'Yes' : 'No';
             }
            return '-'; // Placeholder if not boolean
        },
        _getDateDifference(dobDate, todayDate) {
             // Ensure dates are valid Date objects
             if (!(dobDate instanceof Date) || isNaN(dobDate.getTime()) || 
                 !(todayDate instanceof Date) || isNaN(todayDate.getTime()) ||
                  dobDate > todayDate) {
                 return { years: 0, months: 0, days: 0, totalDays: 0 }; // Return zero difference for invalid/future DOB
             }

            let years = todayDate.getFullYear() - dobDate.getFullYear();
            let months = todayDate.getMonth() - dobDate.getMonth();
            let days = todayDate.getDate() - dobDate.getDate();

            if (days < 0) {
                months--;
                const lastMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 0);
                days += lastMonth.getDate();
            }
            if (months < 0) {
                years--;
                months += 12;
            }
            
            const diffTime = Math.abs(todayDate - dobDate);
            const totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            return { years, months, days, totalDays };
        },
        calculateAge(dobString) {
            if (!dobString) return '-';
            try {
                const dob = new Date(dobString);
                const today = new Date();

                const diff = this._getDateDifference(dob, today);

                // Decide the best unit to display
                if (diff.years > 0) {
                    return `${diff.years} year${diff.years !== 1 ? 's' : ''}`; 
                } else if (diff.months > 0) {
                    return `${diff.months} month${diff.months !== 1 ? 's' : ''}`;
                } else {
                    // Calculate age in weeks and days if less than a month
                    if (diff.totalDays >= 7) {
                        const ageWeeks = Math.floor(diff.totalDays / 7);
                        return `${ageWeeks} week${ageWeeks !== 1 ? 's' : ''}`; 
                    } else {
                         return `${diff.totalDays} day${diff.totalDays !== 1 ? 's' : ''}`; 
                     }
                }
            } catch (e) {
                console.error("Error calculating age:", dobString, e);
                return 'Error';
            }
        },
        readConfig() {
            const appElement = document.getElementById('patient-app'); // Changed ID
            if (appElement && appElement.dataset) {
                this.csrfToken = appElement.dataset.csrfToken;
                this.listApiUrl = appElement.dataset.listApiUrl;
                this.createApiUrl = appElement.dataset.createApiUrl;
                this.detailApiUrlBase = appElement.dataset.detailApiUrlBase;
                this.updateApiUrlBase = appElement.dataset.updateApiUrlBase;
                this.deleteApiUrlBase = appElement.dataset.deleteApiUrlBase;
                // Read new URLs
                this.speciesListUrl = appElement.dataset.speciesListUrl;
                this.breedsBySpeciesUrlBase = appElement.dataset.breedsBySpeciesUrlBase;
                this.ownerListUrl = appElement.dataset.ownerListUrl;
            } else {
                console.error("Could not read config from #patient-app data attributes.");
            }
        },
        fetchPaginatedPatients() { // Renamed
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
                        this.patients = response.data.results; // Changed
                        this.currentPage = response.data.page;
                        this.totalPages = response.data.total_pages;
                        this.totalPatients = response.data.total_patients; // Changed
                        this.perPage = response.data.per_page; // Update in case backend adjusted it
                        this.hasPreviousPage = response.data.has_previous;
                        this.hasNextPage = response.data.has_next;
                    } else {
                         console.error("API Error:", response.data.error);
                         // Handle error display to user if needed
                    }
                })
                .catch(error => {
                    console.error("Error fetching patients:", error); // Changed
                    // Handle network error display
                })
                .finally(() => {
                    this.isLoading = false;
                });
        },
        goToPage(page) {
            if (page >= 1 && page <= this.totalPages) {
                this.currentPage = page;
                this.fetchPaginatedPatients(); // Changed
            }
        },
         changePerPage() {
             this.currentPage = 1;
             this.fetchPaginatedPatients(); // Changed
         },
         applyFilters() {
             this.currentPage = 1; 
             this.fetchPaginatedPatients(); // Changed
         },
         clearFilters() {
            this.searchQuery = '';
            this.selectedFilterFields = this.filterFields.map(f => f.value);
            this.applyFilters(); 
         },
          toggleFilters() {
             this.showFilters = !this.showFilters;
         },
         changeSort(field) {
             // Add new sortable fields here
             const allowedSortFields = new Set([
                 'name', 'owner__last_name', 'species__code', 'breed__name',
                 'sex', 'intact', 'date_of_birth', 'updated_at'
             ]);

             if (!allowedSortFields.has(field)) {
                 console.warn(`Invalid sort field: ${field}`);
                 return;
             }

             if (this.sortField === field) {
                 this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
             } else {
                 this.sortField = field;
                 this.sortDirection = 'asc';
             }
             this.fetchPaginatedPatients(); // Changed
         },
        openCreateModal() {
            // Call the component's openModal method without arguments for create mode
            this.$refs.createEditModal.openModal(); 
        },
        openEditModal(patient) {
            // Call the component's openModal method with patient data for edit mode
            this.$refs.createEditModal.openModal(patient);
        },
        openDeleteModal(patient) {
            this.currentPatient = patient; // Use patient data from the list
            this.showDeleteModal = true;
             this.$nextTick(() => {
                const confirmButton = this.$refs.deleteModal?.querySelector('button[class*="bg-red-500"]');
                 if (confirmButton) confirmButton.focus();
            });
        },
         openViewModal(patient) {
             const detailUrl = this.detailApiUrlBase.replace('/0/', `/${patient.id}/`);
             axios.get(detailUrl)
                 .then(response => {
                     if (response.data && response.data.id) {
                         this.currentPatient = response.data; // Populate currentPatient with full details
                         this.showViewModal = true;
                          this.$nextTick(() => {
                             const closeButton = this.$refs.viewModal?.querySelector('button[class*="bg-gray-200"]'); // Target close button
                             if (closeButton) closeButton.focus();
                         });
                     } else {
                         console.error("Error: Invalid patient data received for view", response.data);
                     }
                 })
                 .catch(error => {
                      console.error("Error fetching patient details for view:", error);
                      alert("Failed to load patient details for viewing.");
                 });
         },
        openEditFromViewModal() {
            const patientToEdit = this.currentPatient;
            this.closeModal(); 
            this.$nextTick(() => {
               if (patientToEdit && patientToEdit.id) {
                   // Call the refactored openEditModal
                   this.openEditModal(patientToEdit);
               } else {
                   console.error("Cannot open edit modal: current patient data is missing or invalid.");
                }
           });
        },
        closeModal(event) {
             // Only close Delete/View modals from main app
             if (!event || event.target === event.currentTarget) {
                 this.showDeleteModal = false;
                 this.showViewModal = false;
                 this.currentPatient = {}; 
             }
         },
        deletePatientConfirm() { // Renamed
            this.isDeleting = true;
             const deleteUrl = this.deleteApiUrlBase.replace('/0/', `/${this.currentPatient.id}/`);

            axios.post(deleteUrl, {}, { 
                headers: { 'X-CSRFToken': this.csrfToken }
            })
            .then(response => {
                if (response.data.success) {
                    this.closeModal();
                     if (this.patients.length === 1 && this.currentPage > 1) {
                         this.currentPage -= 1;
                     }
                    this.fetchPaginatedPatients(); // Refresh the list
                } else {
                    console.error("Error deleting patient (API):", response.data.error);
                    alert(`Error: ${response.data.error || 'Could not delete patient.'}`);
                }
            })
            .catch(error => {
                console.error("Error deleting patient (Network/Server):", error);
                 alert("An unexpected error occurred while deleting the patient.");
            })
            .finally(() => {
                this.isDeleting = false;
            });
        },
        handlePatientSaved(savedPatientData) {
            console.log("Patient saved event received:", savedPatientData);
            // Refresh the list to show the new/updated patient
            this.fetchPaginatedPatients();
            // Optionally show a success notification
        },
        focusAddButtonMaybe() {
           // Optional: Refocus the 'Add New Patient' button after modal closes
           this.$nextTick(() => {
                this.$refs.addButton?.focus(); // Assuming the button has ref="addButton"
            });
        }
    },
    mounted() {
         this.readConfig(); 
         if (this.listApiUrl && this.csrfToken) { 
            this.fetchPaginatedPatients(); // Fetch initial patient data
            // No longer need to fetch species/owners here for the modal
         } else {
             console.error("App initialization failed: Missing config.");
             this.isLoading = false; 
         }
         // Update Escape key listener
         window.addEventListener('keydown', (event) => {
             if (event.key === 'Escape') {
                 // Only close Delete/View modals from main app
                 if (this.showDeleteModal || this.showViewModal) {
                    this.closeModal();
                 }
             }
         });
    },
     beforeUnmount() {
         // Clean up event listener
         // Need proper reference removal
         // window.removeEventListener('keydown', this.globalKeydownListener); 
         // Component handles its own TomSelect destruction
     }
});

patientApp.mount('#patient-app'); // Changed mount point ID 