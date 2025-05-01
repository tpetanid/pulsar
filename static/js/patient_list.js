const patientApp = Vue.createApp({
    data() {
        return {
            patients: [], // Changed from owners
            isLoading: true,
            isSaving: false,
            isDeleting: false,
            // Pagination state
            currentPage: 1,
            perPage: 20, // Default per page
            totalPages: 1,
            totalPatients: 0, // Changed from totalOwners
            hasPreviousPage: false,
            hasNextPage: false,
            // Modals state
            showCreateEditModal: false,
            showDeleteModal: false,
            showViewModal: false,
            isEditMode: false,
            currentPatient: {}, // Changed from currentOwner
            patientForm: { // Changed from ownerForm, added patient fields
                id: null,
                owner: null, // FK to Owner
                name: '',
                species: null, // FK to Species (use code for selection)
                breed: null, // FK to Breed
                sex: 'F', // Default to Female
                weight: null,
                // --- Fields for Create --- 
                intact: true, // Default to intact
                ageValue: null, 
                ageUnit: 'years', // Default unit
            },
            formErrors: {}, // To display validation errors
            // Dropdown options
            availableSpecies: [],
            ownerTomSelect: null, // To hold the Tom Select instance
            breedTomSelect: null, // To hold the Breed Tom Select instance
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
        modalTitle() {
            return this.isEditMode ? 'Edit Patient' : 'Add New Patient'; // Changed
        },
        firstPatientIndex() { // Changed
            if (this.totalPatients === 0) return 0;
            return (this.currentPage - 1) * this.perPage + 1;
        },
        lastPatientIndex() { // Changed
            const last = this.currentPage * this.perPage;
            return last > this.totalPatients ? this.totalPatients : last;
        },
        breedSelectPlaceholder() {
             if (this.isLoadingBreeds) return 'Loading Breeds...';
             if (!this.patientForm.species) return 'Select Species First';
             if (this.availableBreeds.length === 0) return 'No Breeds Found for Species';
             return 'Select Breed';
         }
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
        deriveAgeInputFromDOB(dobString) {
             if (!dobString) return { value: null, unit: 'years' }; // Default if no DOB
            try {
                const dob = new Date(dobString);
                const today = new Date();

                const diff = this._getDateDifference(dob, today);

                // Return the most significant non-zero unit
                if (diff.years > 0) {
                    return { value: diff.years, unit: 'years' };
                } else if (diff.months > 0) {
                    return { value: diff.months, unit: 'months' };
                } else {
                    if (diff.totalDays >= 7) {
                        const ageWeeks = Math.floor(diff.totalDays / 7);
                        return { value: ageWeeks, unit: 'weeks' };
                    } else {
                         return { value: diff.totalDays, unit: 'days' };
                     }
                }
            } catch (e) {
                 console.error("Error deriving age input:", dobString, e);
                 return { value: null, unit: 'years' }; // Default on error
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
        // --- Dropdown Data Fetching Methods (Species/Breed) ---
        fetchAvailableSpecies() {
             axios.get(this.speciesListUrl)
                 .then(response => {
                     // Assuming API returns array of objects like [{code: 'CANINE'}, {code: 'FELINE'}]
                     if (Array.isArray(response.data)) {
                          this.availableSpecies = response.data;
                     } else {
                         console.error("Unexpected format fetching species:", response.data);
                         this.availableSpecies = [];
                     }
                 })
                 .catch(error => {
                     console.error("Error fetching species:", error);
                     this.availableSpecies = []; // Clear on error
                 });
         },
         fetchBreedsForSpecies() {
             const speciesCode = this.patientForm.species;
             // Reset breed form value when species changes
             this.patientForm.breed = null; 

             // Update the existing TomSelect instance
             if (this.breedTomSelect) {
                 this.breedTomSelect.clear(); // Clear selection
                 this.breedTomSelect.clearOptions(); // Clear dropdown options
                 if (speciesCode) {
                     this.breedTomSelect.enable();
                     this.breedTomSelect.settings.placeholder = 'Type or select a breed...'; 
                     this.breedTomSelect.load(''); // Trigger load for the new species
                 } else {
                     this.breedTomSelect.disable();
                     this.breedTomSelect.settings.placeholder = 'Select Species first...';
                 }
             }
         },
        // --- Tom Select Initialization for Owner ---
        initializeOwnerSelect(initialOwner = null) {
            // Destroy existing instance if it exists
            this.ownerTomSelect?.destroy();
            this.ownerTomSelect = null;

            const selectElement = document.getElementById('owner-select');
            if (!selectElement) {
                console.error("#owner-select element not found for Tom Select initialization.");
                return;
            }

            this.ownerTomSelect = new TomSelect(selectElement, {
                valueField: 'id',
                labelField: 'display_name',
                searchField: ['last_name', 'first_name', 'email'], // Fields to search on the backend
                maxOptions: 100, // Limit dropdown results
                // Debounce requests
                loadThrottle: 300,
                // Preload initial options
                preload: true,
                // Preload initial owner if provided (for edit mode)
                options: initialOwner ? [initialOwner] : [],
                items: initialOwner ? [initialOwner.id] : [],
                 create: false, // Don't allow creating new owners from here
                 // Fetch options dynamically
                 load: (query, callback) => {
                     // Always make the call, backend handles empty query
                     const url = `${this.ownerListUrl}?query=${encodeURIComponent(query)}`;
                     
                     axios.get(url)
                         .then(response => {
                            let owners = [];
                            if (response.data.success && response.data.results) {
                                owners = response.data.results.map(owner => ({
                                     ...owner,
                                     // Create a display name for the dropdown
                                     display_name: `${owner.last_name}, ${owner.first_name || ''} (${owner.email || 'No email'})`.trim()
                                }));
                             } else {
                                 console.error("Unexpected format fetching owners for Tom Select:", response.data);
                             }
                             callback(owners); // Pass formatted owners to Tom Select
                         })
                         .catch(error => {
                            console.error("Error fetching owners for Tom Select:", error);
                             callback(); // Proceed without options on error
                         });
                 },
                 // Optional: Render function for customization if needed
                 // render: {
                 //     option: (data, escape) => { ... },
                 //     item: (data, escape) => { ... }
                 // },
                 // Update Vue model on change
                 onChange: (value) => {
                     this.patientForm.owner = value ? parseInt(value) : null;
                 }
            });
        },
        // --- Tom Select Initialization for Breed ---
        initializeBreedSelect(initialBreed = null) {
             // Destroy existing instance
             this.breedTomSelect?.destroy();
             this.breedTomSelect = null;

            const selectElement = document.getElementById('breed-select');
            if (!selectElement) {
                console.error("#breed-select element not found for Tom Select initialization.");
                return;
            }

            // Initialize as disabled
            selectElement.disabled = true;
            selectElement.placeholder = 'Select Species first...';

            this.breedTomSelect = new TomSelect(selectElement, {
                 valueField: 'id',
                 labelField: 'name',
                 searchField: ['name'],
                 maxOptions: 150, // Allow more breeds potentially
                 loadThrottle: 300,
                 preload: false, // Preload is now triggered manually by fetchBreedsForSpecies
                 options: initialBreed ? [initialBreed] : [],
                 items: initialBreed ? [initialBreed.id] : [],
                 create: false, // Don't allow creating new breeds here
                 load: (query, callback) => {
                     const currentSpeciesCode = this.patientForm.species;
                     // Don't load if species isn't selected
                     if (!currentSpeciesCode) return callback(); 

                     // Construct URL with species code and search query
                     const url = `${this.breedsBySpeciesUrlBase}${encodeURIComponent(currentSpeciesCode)}&search=${encodeURIComponent(query)}`;

                     axios.get(url)
                         .then(response => {
                              let breeds = [];
                              if (response.data.success && response.data.results) {
                                  breeds = response.data.results; // Already in {id, name} format
                              } else {
                                  console.error(`Unexpected format fetching breeds for ${currentSpeciesCode}:`, response.data);
                              }
                              callback(breeds);
                         })
                         .catch(error => {
                              console.error(`Error fetching breeds for ${currentSpeciesCode}:`, error);
                              callback();
                         });
                 },
                 onChange: (value) => {
                     this.patientForm.breed = value ? parseInt(value) : null;
                 }
            });
        },
        // --- Pagination, Filter, Sort Methods (Largely unchanged logic, just call fetchPaginatedPatients) ---
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
         // --- Modal Handling Methods --- 
        resetForm() {
            // Reset patient form to defaults
            this.patientForm = {
                id: null, owner: null, name: '', species: null, breed: null, 
                sex: 'F', weight: null,
                // Create mode defaults
                intact: true, 
                ageValue: null, 
                ageUnit: 'years' 
            };
            this.formErrors = {};
            // Destroy breed dropdown instance
            this.breedTomSelect?.destroy();
            this.breedTomSelect = null;
        },
        openCreateModal() {
            this.resetForm();
            this.isEditMode = false;
            this.fetchAvailableSpecies(); // Fetch species for its dropdown
            this.showCreateEditModal = true;
            this.$nextTick(() => {
                // Initialize Tom Select for owner
                this.initializeOwnerSelect();
                // Initialize Breed select (will be disabled initially)
                this.initializeBreedSelect(); // Initialize once
                const firstInput = this.$refs.createEditModal?.querySelector('select, input');
                 if (firstInput && firstInput.id !== 'owner-select') { // Avoid focusing Tom Select input initially
                     firstInput.focus();
                 }
            });
        },
        openEditModal(patient) {
             this.resetForm();
             this.isEditMode = true;
             this.currentPatient = { ...patient }; // Store the patient being edited

             const detailUrl = this.detailApiUrlBase.replace('/0/', `/${patient.id}/`);
             
             // Fetch full patient details first
             axios.get(detailUrl)
                 .then(response => {
                     if (response.data && response.data.id) {
                         const fullPatientData = response.data;
                         // Derive age value/unit from fetched DOB for the form
                         const ageInput = this.deriveAgeInputFromDOB(fullPatientData.date_of_birth);

                         // Populate form with detailed data (ensure date is YYYY-MM-DD)
                         this.patientForm = { 
                             // Spread only the fields relevant to the form
                             id: fullPatientData.id,
                             owner: fullPatientData.owner,
                             name: fullPatientData.name,
                             species: fullPatientData.species, // Species code
                             breed: fullPatientData.breed, // Breed ID
                             sex: fullPatientData.sex,
                             intact: fullPatientData.intact,
                             weight: fullPatientData.weight,
                             // Populate calculated age
                             ageValue: ageInput.value,
                             ageUnit: ageInput.unit,
                         };

                         // Prepare initial owner data for Tom Select
                         const initialOwnerData = {
                             id: fullPatientData.owner, // Owner ID from patient data
                             display_name: fullPatientData.owner_name, // Pre-formatted name from detail view
                             // Include other fields if needed by Tom Select's rendering or searching within the instance
                             last_name: fullPatientData.owner_name.split(',')[0] || '', 
                             first_name: (fullPatientData.owner_name.split(',')[1] || '').split('(')[0].trim(),
                             // email: ... // Not readily available here, might need separate fetch if required by TomSelect display
                         };

                         this.currentPatient = { ...fullPatientData }; // Update currentPatient with full data

                         // Now fetch dropdown data
                         this.fetchAvailableSpecies();

                         // Prepare initial breed data (if applicable)
                         let initialBreedData = null;
                         if (fullPatientData.breed) { // Check if breed exists
                            initialBreedData = {
                                id: fullPatientData.breed,
                                name: fullPatientData.breed_name // Assumes breed_name is available
                            };
                         }

                         this.showCreateEditModal = true;
                          this.$nextTick(() => {
                            // Initialize Tom Select with pre-selected owner
                            this.initializeOwnerSelect(initialOwnerData); // Pass the prepared data
                            // Initialize Breed select once
                            this.initializeBreedSelect(initialBreedData); 
                            // NOW Initialize Breed select with species and potential initial value
                            this.fetchBreedsForSpecies(); 

                            const firstInput = this.$refs.createEditModal?.querySelector('select, input');
                            if (firstInput && firstInput.id !== 'owner-select' && firstInput.id !== 'breed-select') { // Avoid focusing Tom Select inputs initially
                                firstInput.focus();
                            }
                        });
                     } else {
                          console.error("Error: Invalid patient data received for edit", response.data);
                     }
                 })
                 .catch(error => {
                      console.error("Error fetching patient details for editing:", error);
                      alert("Failed to load patient details for editing."); 
                 });
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
                   this.openEditModal(patientToEdit);
               } else {
                   console.error("Cannot open edit modal: current patient data is missing or invalid.");
                }
           });
        },
        closeModal(event) {
             if (!event || event.target === event.currentTarget) {
                 this.showCreateEditModal = false;
                 this.showDeleteModal = false;
                 this.showViewModal = false;
                 // Destroy Tom Select instance when closing modal
                 this.ownerTomSelect?.destroy();
                 this.ownerTomSelect = null;
                 this.breedTomSelect?.destroy();
                 this.breedTomSelect = null;
                 this.resetForm(); 
                 this.currentPatient = {}; 
             }
         },
         // --- Save/Delete Methods --- 
        savePatient() { // Renamed
            this.isSaving = true;
            this.formErrors = {}; 
            let url = this.createApiUrl;
            let method = 'post';

            // Prepare data: Ensure owner/breed are IDs, species is code
            const dataToSend = {
                ...this.patientForm,
                // owner and breed should already be IDs from the select options
                // species should be the code string from the select option
            };
            
            // Remove ID from data if creating (should be null anyway)
            if (!this.isEditMode) {
                delete dataToSend.id;
            } else if (this.patientForm.id) {
                 url = this.updateApiUrlBase.replace('/0/', `/${this.patientForm.id}/`);
            } else {
                console.error("Cannot save: Edit mode but no patient ID.");
                this.isSaving = false;
                return; // Exit if ID is missing in edit mode
            }

            // Calculate DOB from age input before sending
            if (this.patientForm.ageValue !== null && this.patientForm.ageValue >= 0 && this.patientForm.ageUnit) {
                try {
                     const calculatedDOBString = this._calculateDOBFromAge(this.patientForm.ageValue, this.patientForm.ageUnit);
                     if (!calculatedDOBString) {
                         throw new Error("Could not calculate valid DOB string.");
                     }
                     dataToSend.date_of_birth = calculatedDOBString;
                 } catch (e) {
                    console.error("Error processing age before save:", e);
                    this.formErrors = { ...this.formErrors, date_of_birth: ['Could not calculate Date of Birth from age.'] };
                    this.isSaving = false;
                    return;
                }
            } else {
                // Age is required
                this.formErrors = { ...this.formErrors, date_of_birth: ['Age value and unit are required.'] };
                this.isSaving = false;
                return;
            }

            // Remove age fields before sending (they are not part of the backend model)
            delete dataToSend.ageValue;
            delete dataToSend.ageUnit;

            axios({
                method: method,
                url: url,
                data: dataToSend, // Send prepared data
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.csrfToken
                }
            })
            .then(response => {
                if (response.data.success) {
                    this.closeModal();
                    this.fetchPaginatedPatients(); // Refresh the list
                } else if (response.data.errors) {
                     // Should be caught by catch block now for 400 errors
                }
            })
            .catch(error => {
                if (error.response && error.response.status === 400 && error.response.data.errors) {
                    this.formErrors = error.response.data.errors;
                    console.error("Validation Errors:", this.formErrors);
                } else {
                    console.error("Error saving patient:", error);
                     this.formErrors = { non_field_errors: ['An unexpected error occurred. Please try again.'] };
                }
            })
            .finally(() => {
                this.isSaving = false;
            });
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
        _calculateDOBFromAge(ageValue, ageUnit) {
            const age = parseInt(ageValue);
            if (isNaN(age) || age < 0) {
                console.error("Invalid age value for DOB calculation:", ageValue);
                return null; // Indicate error
            }

            const now = new Date();
            let calculatedDOB = new Date(now);

            switch (ageUnit) {
                case 'days':
                    calculatedDOB.setDate(now.getDate() - age);
                    break;
                case 'weeks':
                    calculatedDOB.setDate(now.getDate() - age * 7);
                    break;
                case 'months':
                    calculatedDOB.setMonth(now.getMonth() - age);
                    break;
                case 'years':
                    calculatedDOB.setFullYear(now.getFullYear() - age);
                    break;
                default:
                     console.error("Invalid age unit for DOB calculation:", ageUnit);
                     return null; // Indicate error
            }

            // Check if the calculated date is valid before formatting
            if (isNaN(calculatedDOB.getTime())) {
                console.error("Resulting calculated DOB is invalid.");
                return null;
            }

            return calculatedDOB.toISOString().split('T')[0];
        }
    },
    mounted() {
         this.readConfig(); 
         if (this.listApiUrl && this.csrfToken) { 
            this.fetchPaginatedPatients(); // Fetch initial patient data
            // Fetch initial dropdown data (Species only now)
            this.fetchAvailableSpecies();
         } else {
             console.error("App initialization failed: Missing config.");
             this.isLoading = false; 
         }
         // Add event listener for Escape key
         window.addEventListener('keydown', (event) => {
             if (event.key === 'Escape') {
                 if (this.showCreateEditModal || this.showDeleteModal || this.showViewModal) {
                    this.closeModal();
                 }
             }
         });
    },
     beforeUnmount() {
         // Clean up event listener
         // Keep the reference to the bound listener if needed, or use the direct method call
         window.removeEventListener('keydown', this.closeModal); 
         // Ensure Tom Select instance is destroyed on component unmount
         this.ownerTomSelect?.destroy();
         this.breedTomSelect?.destroy();
     }
});

patientApp.mount('#patient-app'); // Changed mount point ID 