const caseCreateApp = Vue.createApp({
    data() {
        return {
            // API Config & CSRF
            csrfToken: '',
            ownerListApiUrl: '',
            patientListApiUrl: '',
            caseCreateApiUrl: '',

            // UI State
            loading: {
                owners: false,
                patients: false
            },
            isSaving: false,

            // Selected Data
            selectedOwner: {
                id: null,
                name: '' // Display name for UI
            },
            selectedPatient: {
                id: null,
                name: '' // Display name for UI
            },

            // Case Form Data
            caseForm: {
                case_date: this.getTodayDateString(), // Default to today
                complaint: '',
                history: '',
            },
            formErrors: {},

            // TomSelect Instances
            ownerTomSelect: null,

            // Patient list for standard dropdown
            ownerPatientsList: [],
        };
    },
    delimiters: ['[[', ']]'],
    computed: {
        todayDate() {
            return this.getTodayDateString();
        }
    },
    methods: {
        getTodayDateString() {
            // Returns date in 'YYYY-MM-DD' format required by input type="date"
            const today = new Date();
            const year = today.getFullYear();
            const month = (today.getMonth() + 1).toString().padStart(2, '0'); // Months are 0-indexed
            const day = today.getDate().toString().padStart(2, '0');
            return `${year}-${month}-${day}`;
        },
        readConfig() {
            const appElement = document.getElementById('case-create-app');
            if (appElement && appElement.dataset) {
                this.csrfToken = appElement.dataset.csrfToken;
                this.ownerListApiUrl = appElement.dataset.ownerListApiUrl;
                this.patientListApiUrl = appElement.dataset.patientListApiUrl;
                this.caseCreateApiUrl = appElement.dataset.caseCreateApiUrl;
                 // Basic check
                 if (!this.csrfToken || !this.ownerListApiUrl || !this.patientListApiUrl || !this.caseCreateApiUrl) {
                     console.error("Case Create App: Missing one or more API URL/CSRF data attributes.");
                     alert("Page configuration is missing. Please contact support.");
                 }
            } else {
                console.error("Could not read config from #case-create-app data attributes.");
                alert("Page initialization failed.");
            }
        },

        initializeOwnerSelect() {
            this.ownerTomSelect?.destroy();
            const selectElement = document.getElementById('owner-select');
            if (!selectElement) return;

            this.ownerTomSelect = new TomSelect(selectElement, {
                valueField: 'id',
                labelField: 'display_name',
                searchField: ['last_name', 'first_name', 'email'],
                maxOptions: 100,
                loadThrottle: 300,
                create: false,
                placeholder: 'Type to search owners by name or email...',
                onFocus: () => { 
                    this.loading.owners = true; 
                    // Trigger load immediately on focus with empty query
                    this.ownerTomSelect.load(''); 
                },
                onBlur: () => { 
                    // Optional: You might want to delay setting loading to false
                    // or handle it solely within the load function's finally block.
                    // For simplicity, we can let the load function handle it.
                    // this.loading.owners = false; 
                },
                load: (query, callback) => {
                    this.loading.owners = true;
                    const url = `${this.ownerListApiUrl}&query=${encodeURIComponent(query)}`; // Uses minimal=true from config
                    axios.get(url)
                        .then(response => {
                            let owners = [];
                            if (response.data.success && response.data.results) {
                                owners = response.data.results.map(owner => ({
                                    ...owner,
                                    display_name: `${owner.last_name}, ${owner.first_name || ''} (${owner.email || 'No email'})`.trim()
                                }));
                            }
                            callback(owners);
                        })
                        .catch(error => callback())
                        .finally(() => { this.loading.owners = false; });
                },
                onChange: (value) => {
                    this.handleOwnerSelected(value);
                }
            });
        },

        handleOwnerSelected(ownerId) {
            this.ownerPatientsList = []; // Clear previous patient list
            this.selectedPatient = { id: null, name: '' }; // Reset selected patient
            this.formErrors = {}; // Clear errors
            this.caseForm = { ...this.caseForm, complaint: '', history: '' }; // Reset case form fields

            if (ownerId) {
                const ownerData = this.ownerTomSelect.options[ownerId];
                this.selectedOwner = {
                    id: parseInt(ownerId),
                    name: ownerData?.display_name || 'Selected Owner'
                };
                // Fetch patients for this owner
                this.fetchPatientsForOwner(ownerId);
            } else {
                this.selectedOwner = { id: null, name: '' };
                // No need to disable patient select explicitly, v-if handles it
            }
        },

        fetchPatientsForOwner(ownerId) {
            if (!ownerId) return;
            this.loading.patients = true;
            this.ownerPatientsList = []; // Clear existing list
            const url = `${this.patientListApiUrl}?owner_id=${ownerId}&per_page=1000`; // Fetch all patients for owner

            axios.get(url)
                .then(response => {
                    if (response.data.success && response.data.results) {
                        this.ownerPatientsList = response.data.results.map(p => ({
                            id: p.id,
                            name: p.name,
                            display_text: `${p.name} (${p.species_code} - ${p.breed_name})`
                        }));
                    } else {
                        console.warn('Failed to load patients or empty list:', response.data?.error);
                        // Optionally show an error message to the user
                    }
                })
                .catch(error => {
                    console.error("Error fetching patients:", error);
                    // Optionally show an error message to the user
                })
                .finally(() => {
                    this.loading.patients = false;
                });
        },

        handlePatientSelected(event) { // Changed to handle event from standard select
             const patientId = event.target.value;
             if (patientId) {
                const selected = this.ownerPatientsList.find(p => p.id == patientId);
                this.selectedPatient = {
                    id: parseInt(patientId),
                    name: selected?.name || 'Selected Patient'
                };
                this.formErrors = {}; // Clear errors
            } else {
                this.selectedPatient = { id: null, name: '' };
            }
             this.caseForm = { ...this.caseForm, complaint: '', history: '' }; // Reset case form fields
        },

        validateCaseDate() {
            const caseDate = this.caseForm.case_date;
            if (!caseDate) {
                this.formErrors = { ...this.formErrors, case_date: ['Case date is required.'] };
                return false;
            }
            if (caseDate > this.todayDate) {
                this.formErrors = { ...this.formErrors, case_date: ['Case date cannot be in the future.'] };
                return false;
            }
            // Clear specific error if valid
            if (this.formErrors.case_date) {
                delete this.formErrors.case_date;
            }
            return true;
        },

        saveCase() {
            this.isSaving = true;
            this.formErrors = {}; // Clear previous errors

            if (!this.validateCaseDate()) {
                this.isSaving = false;
                return; // Stop if date is invalid
            }

            const dataToSend = {
                owner: this.selectedOwner.id,
                patient: this.selectedPatient.id,
                case_date: this.caseForm.case_date,
                complaint: this.caseForm.complaint,
                history: this.caseForm.history,
            };

            axios({
                method: 'post',
                url: this.caseCreateApiUrl,
                data: dataToSend,
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.csrfToken
                }
            })
            .then(response => {
                if (response.data.success && response.data.case_id) {
                    // Success! Redirect or show message.
                    // For now, just log and maybe clear form.
                    console.log('Case created successfully!', response.data);
                    alert(`Case created successfully (ID: ${response.data.case_id})!`);
                    // Optionally redirect to a case detail page (if one exists)
                    // window.location.href = `/cases/${response.data.case_id}/`;
                    this.resetPage(); // Reset selections and form
                } else if (response.data.errors) {
                    this.formErrors = response.data.errors;
                } else {
                     console.error("Unexpected response format on save:", response.data);
                     this.formErrors = { non_field_errors: ['Save successful, but unexpected response received.'] };
                }
            })
            .catch(error => {
                if (error.response && error.response.status === 400 && error.response.data.errors) {
                    this.formErrors = error.response.data.errors;
                } else {
                    console.error("Error saving case:", error);
                    this.formErrors = { non_field_errors: ['An unexpected error occurred while saving the case. Please try again.'] };
                }
            })
            .finally(() => {
                this.isSaving = false;
            });
        },

        resetPage() {
             // Reset selections
            this.ownerTomSelect?.clear();
            this.handleOwnerSelected(null); // This will also clear patient
            // Reset form
            this.caseForm = {
                case_date: this.getTodayDateString(),
                complaint: '',
                history: '',
            };
            this.formErrors = {};
            this.isSaving = false;
            // Scroll to top maybe?
            window.scrollTo(0, 0);
        },
    },
    mounted() {
        this.readConfig();
        if (this.csrfToken) { // Proceed only if config seems okay
            this.initializeOwnerSelect();
        } else {
             // Error handling done in readConfig
        }
    },
    beforeUnmount() {
        this.ownerTomSelect?.destroy();
    }
});

caseCreateApp.mount('#case-create-app'); 