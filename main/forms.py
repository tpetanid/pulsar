from django import forms
from django.utils import timezone
from .models import Owner, Species, Breed, Patient, Case

class OwnerForm(forms.ModelForm):
    class Meta:
        model = Owner
        fields = ['last_name', 'first_name', 'email', 'telephone', 'address', 'comments']
        # You can add widgets here later if needed for styling 

# --- New Patient Form --- #

class PatientForm(forms.ModelForm):
    # We expect species to come as a Species instance from the view,
    # and breed/owner as IDs initially, but ModelChoiceField handles the conversion.
    species = forms.ModelChoiceField(queryset=Species.objects.all(), to_field_name='code',
                                     error_messages={'invalid_choice': 'Invalid species code.'})
    breed = forms.ModelChoiceField(queryset=Breed.objects.all(),
                                  error_messages={'invalid_choice': 'Invalid breed selection.'})
    owner = forms.ModelChoiceField(queryset=Owner.objects.all(),
                                  error_messages={'invalid_choice': 'Invalid owner selection.'})

    class Meta:
        model = Patient
        fields = ['owner', 'name', 'species', 'breed', 'sex', 'intact', 'date_of_birth', 'weight']
        # Add widgets if direct form rendering was used (not strictly needed for API)
        # widgets = {
        #     'date_of_birth': forms.DateInput(attrs={'type': 'date'}),
        # }

    def clean(self):
        cleaned_data = super().clean()
        species = cleaned_data.get("species")
        breed = cleaned_data.get("breed")

        if species and breed:
            # Check if the selected breed belongs to the selected species
            if breed.species != species:
                self.add_error('breed', f"Breed '{breed.name}' does not belong to species '{species.code}'.")
                # Optionally, raise ValidationError instead if you prefer a single error message
                # raise forms.ValidationError(
                #     f"Breed '{breed.name}' does not belong to species '{species.code}'."
                # )
        
        # Add any other cross-field validation here

        return cleaned_data 

# --- Case Form --- #

class CaseForm(forms.ModelForm):
    class Meta:
        model = Case
        fields = ['owner', 'patient', 'case_date', 'complaint', 'history']
        widgets = {
            'owner': forms.HiddenInput(), # Owner will be set based on selection
            'patient': forms.HiddenInput(), # Patient will be set based on selection
            'case_date': forms.DateInput(attrs={'type': 'date'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Ensure owner and patient are not required at the form level
        # as they will be handled/validated in the view/frontend logic
        # before this form is instantiated with IDs.
        self.fields['owner'].required = False
        self.fields['patient'].required = False

    def clean_case_date(self):
        case_date = self.cleaned_data.get('case_date')
        if case_date and case_date > timezone.now().date():
            raise forms.ValidationError("The case date cannot be in the future.")
        return case_date 