const OwnerCreateEditModal = {
    props: {
        csrfToken: {
            type: String,
            required: true
        },
        createApiUrl: {
            type: String,
            required: true
        },
        detailApiUrlBase: { // e.g., /api/owners/0/ - 0 is placeholder
            type: String,
            required: true
        },
        updateApiUrlBase: { // e.g., /api/owners/0/update/ - 0 is placeholder
            type: String,
            required: true
        }
    },
    emits: ['owner-saved', 'modal-closed'], // Declare emitted events
    data() {
        return {
            showModal: false,
            isEditMode: false,
            isSaving: false,
            ownerForm: {
                id: null,
                last_name: '',
                first_name: '',
                email: '',
                telephone: '',
                address: '',
                comments: '',
            },
            formErrors: {}
        };
    },
    computed: {
        modalTitle() {
            return this.isEditMode ? 'Edit Owner' : 'Add New Owner';
        }
    },
    methods: {
        // --- Modal Control ---
        openModal(ownerToEdit = null) {
            this.resetForm();
            if (ownerToEdit && ownerToEdit.id) {
                this.isEditMode = true;
                // Fetch full details to ensure we have the latest data
                const detailUrl = this.detailApiUrlBase.replace('/0/', `/${ownerToEdit.id}/`);
                axios.get(detailUrl)
                    .then(response => {
                        if (response.data && response.data.id) {
                            this.ownerForm = response.data; // Populate form
                            this.showModal = true;
                            this.focusFirstInput();
                        } else {
                            console.error("Error: Invalid owner data received for edit", response.data);
                            alert("Failed to load owner details for editing.");
                        }
                    })
                    .catch(error => {
                        console.error("Error fetching owner details:", error);
                        alert("Failed to load owner details for editing.");
                    });
            } else {
                // Create mode
                this.isEditMode = false;
                this.showModal = true;
                this.focusFirstInput();
            }
        },
        closeModalInternal() {
             // Internal method to handle closing actions
             this.showModal = false;
             this.resetForm();
             this.$emit('modal-closed'); // Emit event
        },
        handleBackdropClick(event) {
            // Close only if the backdrop itself is clicked
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
            // Focus the first focusable element in the modal after it's rendered
            this.$nextTick(() => {
                const firstInput = this.$el?.querySelector('input:not([type=hidden]), textarea');
                if (firstInput) {
                    firstInput.focus();
                }
            });
        },

        // --- Form Handling ---
        resetForm() {
            this.ownerForm = { id: null, last_name: '', first_name: '', email: '', telephone: '', address: '', comments: '' };
            this.formErrors = {};
            this.isSaving = false; // Reset saving state
        },
        saveOwner() {
            this.isSaving = true;
            this.formErrors = {}; // Clear previous errors
            let url = this.createApiUrl;
            let method = 'post';

            if (this.isEditMode && this.ownerForm.id) {
                url = this.updateApiUrlBase.replace('/0/', `/${this.ownerForm.id}/`);
                // Method remains 'post' as the backend view handles update on POST
            }

            axios({
                method: method,
                url: url,
                data: this.ownerForm,
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.csrfToken // Use prop
                }
            })
            .then(response => {
                // Backend returns owner data nested under 'owner' key on success
                if (response.data.success && response.data.owner) {
                    // Emit event with the saved owner data
                    this.$emit('owner-saved', response.data.owner);
                    this.closeModalInternal(); // Close modal on success
                } else if (response.data.errors) {
                    // This case might be handled by the catch block for 400 status
                    this.formErrors = response.data.errors;
                } else {
                    // Handle unexpected success response format
                    console.error("Unexpected response format on save:", response.data);
                    this.formErrors = { non_field_errors: ['Save successful, but unexpected response received.'] };
                }
            })
            .catch(error => {
                if (error.response && error.response.status === 400 && error.response.data.errors) {
                    // Handle validation errors from Django form
                    this.formErrors = error.response.data.errors;
                } else {
                    console.error("Error saving owner:", error);
                    this.formErrors = { non_field_errors: ['An unexpected error occurred. Please try again.'] };
                }
            })
            .finally(() => {
                this.isSaving = false;
            });
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
                        <form @submit.prevent="saveOwner" class="space-y-4 text-left">
                            <div v-if="formErrors.non_field_errors" class="text-red-500 text-sm mb-2">{{ formErrors.non_field_errors.join(', ') }}</div>
                            
                            <div>
                                <label for="last_name" class="block text-sm font-medium text-gray-700">Last Name *</label>
                                <input type="text" v-model="ownerForm.last_name" id="last_name" required
                                       class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                       :class="{'border-red-500': formErrors.last_name, 'border-gray-300': !formErrors.last_name}">
                                <p v-if="formErrors.last_name" class="mt-1 text-xs text-red-500">{{ formErrors.last_name.join(', ') }}</p>
                            </div>
                            
                            <div>
                                <label for="first_name" class="block text-sm font-medium text-gray-700">First Name</label>
                                <input type="text" v-model="ownerForm.first_name" id="first_name"
                                       class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                       :class="{'border-red-500': formErrors.first_name, 'border-gray-300': !formErrors.first_name}">
                                 <p v-if="formErrors.first_name" class="mt-1 text-xs text-red-500">{{ formErrors.first_name.join(', ') }}</p>
                            </div>
                             
                            <div>
                                <label for="email" class="block text-sm font-medium text-gray-700">Email</label>
                                <input type="email" v-model="ownerForm.email" id="email"
                                       class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                       :class="{'border-red-500': formErrors.email, 'border-gray-300': !formErrors.email}">
                                <p v-if="formErrors.email" class="mt-1 text-xs text-red-500">{{ formErrors.email.join(', ') }}</p>
                            </div>
                            
                            <div>
                                <label for="telephone" class="block text-sm font-medium text-gray-700">Telephone</label>
                                <input type="tel" v-model="ownerForm.telephone" id="telephone"
                                       class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                       :class="{'border-red-500': formErrors.telephone, 'border-gray-300': !formErrors.telephone}">
                                 <p v-if="formErrors.telephone" class="mt-1 text-xs text-red-500">{{ formErrors.telephone.join(', ') }}</p>
                            </div>
                            
                            <div>
                                <label for="address" class="block text-sm font-medium text-gray-700">Address</label>
                                <textarea v-model="ownerForm.address" id="address" rows="3"
                                          class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                          :class="{'border-red-500': formErrors.address, 'border-gray-300': !formErrors.address}"></textarea>
                                <p v-if="formErrors.address" class="mt-1 text-xs text-red-500">{{ formErrors.address.join(', ') }}</p>
                            </div>
                             
                            <div>
                                <label for="comments" class="block text-sm font-medium text-gray-700">Comments</label>
                                <textarea v-model="ownerForm.comments" id="comments" rows="3"
                                          class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                          :class="{'border-red-500': formErrors.comments, 'border-gray-300': !formErrors.comments}"></textarea>
                                <p v-if="formErrors.comments" class="mt-1 text-xs text-red-500">{{ formErrors.comments.join(', ') }}</p>
                            </div>

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