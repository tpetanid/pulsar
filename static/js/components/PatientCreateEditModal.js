const PatientCreateEditModal = {
    props: {
        // Required API URLs and CSRF token
        csrfToken: { type: String, required: true },
        createApiUrl: { type: String, required: true },
        detailApiUrlBase: { type: String, required: true }, // e.g., /api/patients/0/
        updateApiUrlBase: { type: String, required: true }, // e.g., /api/patients/0/update/
        speciesListUrl: { type: String, required: true },
        breedsBySpeciesUrlBase: { type: String, required: true }, // e.g., /api/breeds/?species_code=
        ownerListUrl: { type: String, required: true } // e.g., /api/owners/?minimal=true
    },
    emits: ['patient-saved', 'modal-closed'],
    data() {
        return {
            showModal: false,
            isEditMode: false,
            isSaving: false,
            patientForm: {
                id: null,
                owner: null,
                name: '',
                species: null,
                breed: null,
                sex: 'F',
                intact: true,
                ageValue: null,
                ageUnit: 'years',
                weight: null
            },
            formErrors: {},
            // Dropdown options
            availableSpecies: [],
            ownerTomSelect: null,
            breedTomSelect: null,
            isLoadingSpecies: false,
            isLoadingBreeds: false,
            isLoadingOwners: false, // Added for owner loading state
        };
    },
    computed: {
        modalTitle() {
            return this.isEditMode ? 'Edit Patient' : 'Add New Patient';
        },
        // Maybe add computed for breed placeholder later if needed
    },
    methods: {
        // --- Modal Control ---
        openModal(patientToEdit = null) {
            this.resetForm();
            this.fetchAvailableSpecies(); // Fetch species list immediately

            if (patientToEdit && patientToEdit.id) {
                this.isEditMode = true;
                // Fetch full patient details
                const detailUrl = this.detailApiUrlBase.replace('/0/', `/${patientToEdit.id}/`);
                axios.get(detailUrl)
                    .then(response => {
                        if (response.data && response.data.id) {
                            const fullPatientData = response.data;
                            const ageInput = this.deriveAgeInputFromDOB(fullPatientData.date_of_birth);
                            this.patientForm = { // Populate form
                                id: fullPatientData.id,
                                owner: fullPatientData.owner,
                                name: fullPatientData.name,
                                species: fullPatientData.species, // Species code
                                breed: fullPatientData.breed, // Breed ID
                                sex: fullPatientData.sex,
                                intact: fullPatientData.intact,
                                weight: fullPatientData.weight,
                                ageValue: ageInput.value,
                                ageUnit: ageInput.unit,
                            };

                            // Prepare initial owner/breed data for TomSelect
                            const initialOwnerData = {
                                id: fullPatientData.owner,
                                display_name: fullPatientData.owner_name,
                                last_name: fullPatientData.owner_name.split(',')[0] || '',
                                first_name: (fullPatientData.owner_name.split(',')[1] || '').split('(')[0].trim(),
                            };
                            let initialBreedData = null;
                             if (fullPatientData.breed) {
                                initialBreedData = {
                                    id: fullPatientData.breed,
                                    name: fullPatientData.breed_name
                                };
                             }
                            this.showModal = true;
                            this.$nextTick(() => {
                                 this.initializeOwnerSelect(initialOwnerData);
                                 this.initializeBreedSelect(initialBreedData);
                                 this.fetchBreedsForSpecies(); // Trigger breed loading
                                 this.focusFirstInput();
                            });
                        } else {
                            console.error("Error: Invalid patient data received for edit", response.data);
                            alert("Failed to load patient details for editing.");
                        }
                    })
                    .catch(error => {
                        console.error("Error fetching patient details:", error);
                        alert("Failed to load patient details for editing.");
                    });
            } else {
                // Create mode
                this.isEditMode = false;
                this.showModal = true;
                this.$nextTick(() => {
                     this.initializeOwnerSelect();
                     this.initializeBreedSelect(); // Initialize but keep disabled initially
                     this.focusFirstInput();
                });
            }
        },
        closeModalInternal() {
            this.showModal = false;
            this.ownerTomSelect?.destroy();
            this.breedTomSelect?.destroy();
            this.ownerTomSelect = null;
            this.breedTomSelect = null;
            this.resetForm();
            this.$emit('modal-closed');
        },
        handleBackdropClick(event) {
            if (event.target === event.currentTarget) {
                this.closeModalInternal();
            }
        },
        handleEscapeKey(event) {
            if (event.key === 'Escape') {
                this.closeModalInternal();
            }
        },
        focusFirstInput() {
             this.$nextTick(() => {
                 // Try focusing the Patient Name input first
                 const nameInput = this.$el?.querySelector('#name');
                 if (nameInput) {
                    nameInput.focus();
                 } else {
                    // Fallback to the first available input/select if name input isn't found (shouldn't happen)
                    const firstFocusable = this.$el?.querySelector('input:not([type=hidden]), select, textarea');
                    if (firstFocusable && !firstFocusable.classList.contains('ts-input')) { // Avoid focusing TomSelect hidden input
                        firstFocusable.focus();
                    }
                 }
             });
         },

        // --- Form Handling ---
        resetForm() {
            this.patientForm = {
                id: null, owner: null, name: '', species: null, breed: null,
                sex: 'F', intact: true, ageValue: null, ageUnit: 'years', weight: null
            };
            this.formErrors = {};
            this.isSaving = false;
            // Reset species list? Maybe not, could persist between modal opens
            // this.availableSpecies = [];
            // TomSelect instances cleared in closeModalInternal
        },
        savePatient() {
            this.isSaving = true;
            this.formErrors = {};
            let url = this.createApiUrl;
            let method = 'post';

            // Prepare data to send
            const dataToSend = {
                ...this.patientForm,
            };

            // Calculate DOB from age
             if (this.patientForm.ageValue !== null && this.patientForm.ageValue >= 0 && this.patientForm.ageUnit) {
                try {
                     const calculatedDOBString = this._calculateDOBFromAge(this.patientForm.ageValue, this.patientForm.ageUnit);
                     if (!calculatedDOBString) throw new Error("Could not calculate DOB");
                     dataToSend.date_of_birth = calculatedDOBString;
                 } catch (e) {
                    this.formErrors = { ...this.formErrors, date_of_birth: ['Invalid age input for DOB calculation.'] };
                    this.isSaving = false;
                    return;
                }
            } else {
                 this.formErrors = { ...this.formErrors, date_of_birth: ['Age is required.'] };
                 this.isSaving = false;
                 return;
            }

            // Remove age fields as they are not part of the backend model
            delete dataToSend.ageValue;
            delete dataToSend.ageUnit;

            if (this.isEditMode && this.patientForm.id) {
                url = this.updateApiUrlBase.replace('/0/', `/${this.patientForm.id}/`);
            } else {
                delete dataToSend.id; // Ensure no ID is sent for creation
            }

            axios({
                method: method,
                url: url,
                data: dataToSend,
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.csrfToken
                }
            })
            .then(response => {
                // Assuming backend returns {success: true, patient_id: ...} or {success: true, patient: {...}} on success
                if (response.data.success) {
                    // Fetch full patient details using the ID before emitting
                    // This ensures the parent component gets consistent data
                    const patientId = response.data.patient_id || response.data.patient?.id;
                    if (patientId) {
                         this.fetchAndEmitSavedPatient(patientId);
                    } else {
                         // Fallback if ID not returned (less ideal)
                         this.$emit('patient-saved', { id: null, ...dataToSend }); // Emit potentially incomplete data
                         this.closeModalInternal();
                    }
                } else if (response.data.errors) {
                     this.formErrors = response.data.errors;
                } else {
                     this.formErrors = { non_field_errors: ['An unexpected success response format received.'] };
                }
            })
            .catch(error => {
                if (error.response && error.response.status === 400 && error.response.data.errors) {
                    this.formErrors = error.response.data.errors;
                } else {
                    console.error("Error saving patient:", error);
                    this.formErrors = { non_field_errors: ['An unexpected error occurred. Please try again.'] };
                }
            })
            .finally(() => {
                this.isSaving = false;
            });
        },
        fetchAndEmitSavedPatient(patientId) {
             const detailUrl = this.detailApiUrlBase.replace('/0/', `/${patientId}/`);
             axios.get(detailUrl)
                 .then(res => {
                     if (res.data && res.data.id) {
                         this.$emit('patient-saved', res.data); // Emit full data
                         this.closeModalInternal();
                     } else {
                         console.error("Failed to fetch details of saved patient.")
                         // Handle error - maybe emit partial data or show error
                          this.$emit('patient-saved', { id: patientId }); // Emit at least the ID
                          this.closeModalInternal();
                     }
                 })
                 .catch(err => {
                     console.error("Error fetching details of saved patient:", err);
                     // Handle error
                      this.$emit('patient-saved', { id: patientId }); // Emit at least the ID
                      this.closeModalInternal();
                 });
         },

        // --- Dropdown Data Fetching & Initialization ---
        fetchAvailableSpecies() {
            this.isLoadingSpecies = true;
            axios.get(this.speciesListUrl)
                .then(response => {
                    if (Array.isArray(response.data)) {
                        this.availableSpecies = response.data;
                    } else {
                        console.error("Unexpected format fetching species:", response.data);
                    }
                })
                .catch(error => console.error("Error fetching species:", error))
                .finally(() => { this.isLoadingSpecies = false; });
        },
        fetchBreedsForSpecies() {
            const speciesCode = this.patientForm.species;
            this.patientForm.breed = null; // Reset breed selection

            if (this.breedTomSelect) {
                this.breedTomSelect.clear();
                this.breedTomSelect.clearOptions();
                if (speciesCode) {
                    this.breedTomSelect.enable();
                    this.breedTomSelect.settings.placeholder = 'Loading breeds...';
                    this.breedTomSelect.load(''); // Trigger load
                } else {
                    this.breedTomSelect.disable();
                    this.breedTomSelect.settings.placeholder = 'Select Species first...';
                }
                this.breedTomSelect.refreshOptions(); // Update placeholder display
            }
        },
        initializeOwnerSelect(initialOwner = null) {
            this.ownerTomSelect?.destroy();
            const selectElement = this.$el?.querySelector('#owner-select');
            if (!selectElement) return;

            this.ownerTomSelect = new TomSelect(selectElement, {
                valueField: 'id',
                labelField: 'display_name',
                searchField: ['last_name', 'first_name', 'email'],
                maxOptions: 100,
                loadThrottle: 300,
                preload: !!initialOwner, // Preload only if initial owner exists
                options: initialOwner ? [initialOwner] : [],
                items: initialOwner ? [initialOwner.id] : [],
                create: false,
                onFocus: () => { 
                    this.isLoadingOwners = true; 
                    // Trigger load immediately on focus with empty query
                    this.ownerTomSelect?.load(''); // Use optional chaining just in case
                 }, 
                 onBlur: () => { this.isLoadingOwners = false; }, // Reset loading on blur
                 load: (query, callback) => {
                     this.isLoadingOwners = true;
                     const url = `${this.ownerListUrl}&query=${encodeURIComponent(query)}`; // ownerListUrl already includes minimal=true
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
                         .finally(() => { this.isLoadingOwners = false; });
                 },
                onChange: (value) => {
                    this.patientForm.owner = value ? parseInt(value) : null;
                }
            });
        },
        initializeBreedSelect(initialBreed = null) {
            this.breedTomSelect?.destroy();
            const selectElement = this.$el?.querySelector('#breed-select');
            if (!selectElement) return;

            selectElement.disabled = !this.patientForm.species; // Disable based on initial state

            this.breedTomSelect = new TomSelect(selectElement, {
                valueField: 'id',
                labelField: 'name',
                searchField: ['name'],
                maxOptions: 150,
                loadThrottle: 300,
                preload: !!initialBreed, // Preload only if initial breed exists
                options: initialBreed ? [initialBreed] : [],
                items: initialBreed ? [initialBreed.id] : [],
                create: false,
                placeholder: this.patientForm.species ? 'Type or select a breed...' : 'Select Species first...',
                 onFocus: () => { 
                     this.isLoadingBreeds = true; 
                     // Trigger load immediately on focus with empty query, only if species is selected
                     if (this.patientForm.species) {
                         this.breedTomSelect?.load(''); // Use optional chaining
                     }
                 }, 
                 onBlur: () => { this.isLoadingBreeds = false; }, // Reset loading on blur
                 load: (query, callback) => {
                    const currentSpeciesCode = this.patientForm.species;
                    if (!currentSpeciesCode) return callback();
                    this.isLoadingBreeds = true;
                    const url = `${this.breedsBySpeciesUrlBase}${encodeURIComponent(currentSpeciesCode)}&search=${encodeURIComponent(query)}`;
                    axios.get(url)
                        .then(response => {
                            let breeds = [];
                             if (response.data.success && response.data.results) {
                                 breeds = response.data.results;
                                 this.breedTomSelect.settings.placeholder = 'Type or select a breed...';
                             } else {
                                  this.breedTomSelect.settings.placeholder = 'No breeds found...';
                             }
                            callback(breeds);
                        })
                        .catch(error => callback())
                        .finally(() => { 
                            this.isLoadingBreeds = false;
                             this.breedTomSelect.refreshOptions(); // Update placeholder display
                         });
                },
                onChange: (value) => {
                    this.patientForm.breed = value ? parseInt(value) : null;
                }
            });
        },

        // --- Utility Methods (Age/Date calculation) ---
        _getDateDifference(dobDate, todayDate) {
             if (!(dobDate instanceof Date) || isNaN(dobDate.getTime()) ||
                 !(todayDate instanceof Date) || isNaN(todayDate.getTime()) ||
                  dobDate > todayDate) {
                 return { years: 0, months: 0, days: 0, totalDays: 0 };
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
        deriveAgeInputFromDOB(dobString) {
             if (!dobString) return { value: null, unit: 'years' };
            try {
                const dob = new Date(dobString);
                const today = new Date();
                const diff = this._getDateDifference(dob, today);
                if (diff.years > 0) return { value: diff.years, unit: 'years' };
                if (diff.months > 0) return { value: diff.months, unit: 'months' };
                if (diff.totalDays >= 7) return { value: Math.floor(diff.totalDays / 7), unit: 'weeks' };
                return { value: diff.totalDays, unit: 'days' };
            } catch (e) {
                 return { value: null, unit: 'years' };
            }
        },
         _calculateDOBFromAge(ageValue, ageUnit) {
            const age = parseInt(ageValue);
            if (isNaN(age) || age < 0) return null;
            const now = new Date();
            let calculatedDOB = new Date(now);
            switch (ageUnit) {
                case 'days': calculatedDOB.setDate(now.getDate() - age); break;
                case 'weeks': calculatedDOB.setDate(now.getDate() - age * 7); break;
                case 'months': calculatedDOB.setMonth(now.getMonth() - age); break;
                case 'years': calculatedDOB.setFullYear(now.getFullYear() - age); break;
                default: return null;
            }
            if (isNaN(calculatedDOB.getTime())) return null;
            return calculatedDOB.toISOString().split('T')[0];
        }
    },
    watch: {
        // Watch for changes in species to re-trigger breed fetching/reset
        'patientForm.species'(newSpecies, oldSpecies) {
            if (newSpecies !== oldSpecies) {
                this.fetchBreedsForSpecies();
            }
        }
    },
    // Template contains the HTML structure of the modal
    template: `
        <transition name="fade">
            <div v-if="showModal"
                 @click="handleBackdropClick"
                 @keydown.escape="handleEscapeKey"
                 tabindex="-1"
                 class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50 outline-none" >

                <div @click.stop class="relative mx-auto p-5 border w-full max-w-xl shadow-lg rounded-md bg-white">
                    <div class="mt-3 text-center">
                        <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">{{ modalTitle }}</h3>
                        <form @submit.prevent="savePatient" class="space-y-4 text-left">
                            <div v-if="formErrors.non_field_errors" class="text-red-500 text-sm mb-2">{{ formErrors.non_field_errors.join(', ') }}</div>

                            <!-- Owner Selection -->
                            <div>
                                <label for="owner-select" class="block text-sm font-medium text-gray-700">Owner *</label>
                                <select id="owner-select" placeholder="Type to search owners..." required></select>
                                <p v-if="isLoadingOwners" class="text-xs text-gray-500 italic">Loading owners...</p>
                                <p v-if="formErrors.owner" class="mt-1 text-xs text-red-500">{{ formErrors.owner.join(', ') }}</p>
                            </div>

                            <!-- Patient Name -->
                            <div>
                                <label for="name" class="block text-sm font-medium text-gray-700">Patient Name *</label>
                                <input type="text" v-model="patientForm.name" id="name" required
                                       class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                       :class="{'border-red-500': formErrors.name, 'border-gray-300': !formErrors.name}">
                                <p v-if="formErrors.name" class="mt-1 text-xs text-red-500">{{ formErrors.name.join(', ') }}</p>
                            </div>

                            <!-- Species Selection -->
                             <div>
                                <label for="species" class="block text-sm font-medium text-gray-700">Species *</label>
                                 <select v-model="patientForm.species" id="species" required
                                        class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                        :class="{'border-red-500': formErrors.species, 'border-gray-300': !formErrors.species}">
                                    <option :value="null" disabled>{{ isLoadingSpecies ? 'Loading...' : 'Select Species' }}</option>
                                    <option v-for="spec in availableSpecies" :key="spec.code" :value="spec.code">
                                        {{ spec.code }}
                                    </option>
                                </select>
                                <p v-if="formErrors.species" class="mt-1 text-xs text-red-500">{{ formErrors.species.join(', ') }}</p>
                            </div>

                            <!-- Breed Selection (TomSelect) -->
                              <div>
                                <label for="breed-select" class="block text-sm font-medium text-gray-700">Breed *</label>
                                <select id="breed-select" placeholder="Select Species first..." required :disabled="!patientForm.species || isLoadingBreeds"></select>
                                <p v-if="isLoadingBreeds" class="text-xs text-gray-500 italic">Loading breeds...</p>
                                <p v-if="formErrors.breed" class="mt-1 text-xs text-red-500">{{ formErrors.breed.join(', ') }}</p>
                            </div>

                            <!-- Sex Selection -->
                             <div>
                                <label for="sex" class="block text-sm font-medium text-gray-700">Sex *</label>
                                 <select v-model="patientForm.sex" id="sex" required
                                        class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                        :class="{'border-red-500': formErrors.sex, 'border-gray-300': !formErrors.sex}">
                                    <option value="M">Male</option>
                                    <option value="F">Female</option>
                                </select>
                                <p v-if="formErrors.sex" class="mt-1 text-xs text-red-500">{{ formErrors.sex.join(', ') }}</p>
                            </div>

                            <!-- Intact Checkbox -->
                             <div class="flex items-start pt-2"> 
                                  <div class="flex items-center h-5">
                                    <input id="intact" name="intact" type="checkbox" v-model="patientForm.intact"
                                           class="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded">
                                  </div>
                                  <div class="ml-3 text-sm">
                                    <label for="intact" class="font-medium text-gray-700">Intact (Unneutered/Unspayed)</label>
                                  </div>
                                  
                             </div>

                            <!-- Age Input -->
                            <div>
                                <label for="age_value" class="block text-sm font-medium text-gray-700">Age *</label>
                                <div class="mt-1 flex space-x-2">
                                    <input type="number" v-model.number="patientForm.ageValue" id="age_value" required min="0" placeholder="e.g., 3"
                                           class="block w-1/2 px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                           :class="{'border-red-500': formErrors.ageValue || formErrors.date_of_birth, 'border-gray-300': !(formErrors.ageValue || formErrors.date_of_birth)}">
                                    <select v-model="patientForm.ageUnit" id="age_unit" required
                                            class="block w-1/2 px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                            :class="{'border-red-500': formErrors.ageUnit || formErrors.date_of_birth, 'border-gray-300': !(formErrors.ageUnit || formErrors.date_of_birth)}">
                                        <option value="days">Days</option>
                                        <option value="weeks">Weeks</option>
                                        <option value="months">Months</option>
                                        <option value="years">Years</option>
                                    </select>
                                </div>
                                 <p v-if="formErrors.date_of_birth" class="mt-1 text-xs text-red-500">{{ formErrors.date_of_birth.join(', ') }}</p>
                                 <p v-if="formErrors.ageValue" class="mt-1 text-xs text-red-500">{{ formErrors.ageValue.join(', ') }}</p>
                                 <p v-if="formErrors.ageUnit" class="mt-1 text-xs text-red-500">{{ formErrors.ageUnit.join(', ') }}</p>
                            </div>

                            <!-- Weight -->
                             <div>
                                <label for="weight" class="block text-sm font-medium text-gray-700">Weight (kg) *</label>
                                <input type="number" step="0.01" min="0" v-model.number="patientForm.weight" id="weight" required
                                       class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                       :class="{'border-red-500': formErrors.weight, 'border-gray-300': !formErrors.weight}">
                                <p v-if="formErrors.weight" class="mt-1 text-xs text-red-500">{{ formErrors.weight.join(', ') }}</p>
                            </div>

                            <!-- Action Buttons -->
                            <div class="items-center px-4 py-3 border-t border-gray-200 mt-4 text-right">
                                <button type="submit" :disabled="isSaving"
                                        class="px-4 py-2 bg-blue-500 text-white text-base font-medium rounded-md w-auto shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50">
                                    {{ isSaving ? 'Saving...' : 'Save' }}
                                </button>
                                <button type="button" @click="closeModalInternal"
                                        class="ml-2 px-4 py-2 bg-gray-200 text-gray-800 text-base font-medium rounded-md w-auto shadow-sm hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </transition>
    `
}; 