from django import forms
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Submit, Field, Div
from .models import Owner

class OwnerForm(forms.ModelForm):
    class Meta:
        model = Owner
        fields = ['first_name', 'last_name', 'email', 'telephone', 'address', 'comment']
        widgets = {
            'address': forms.Textarea(attrs={'rows': 3}),
            'comment': forms.Textarea(attrs={'rows': 3}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # Make all fields except last_name optional
        for field_name, field in self.fields.items():
            if field_name != 'last_name':
                field.required = False

        self.helper = FormHelper()
        self.helper.form_tag = False
        self.helper.layout = Layout(
            Div(  # Row for first name and last name
                Div(
                    Field('first_name', css_class='w-full'),
                    css_class='w-full md:w-1/2 px-3 mb-6 md:mb-0' # Added md:mb-0 to remove bottom margin on medium screens
                ),
                Div(
                    Field('last_name', css_class='w-full'),
                    css_class='w-full md:w-1/2 px-3'
                ),
                css_class='flex flex-wrap -mx-3 mb-6' # Added mb-6 for spacing below the row
            ),
            Div(  # Row for email and telephone
                Div(
                    Field('email', css_class='w-full'),
                    css_class='w-full md:w-1/2 px-3 mb-6 md:mb-0' # Added md:mb-0
                ),
                Div(
                    Field('telephone', css_class='w-full'),
                    css_class='w-full md:w-1/2 px-3'
                ),
                css_class='flex flex-wrap -mx-3 mb-6' # Added mb-6
            ),
            Div(  # Row for address - Modified for alignment
                Div(
                    Field('address', css_class='w-full'),
                    css_class='w-full px-3'  # Inner div with padding
                ),
                css_class='flex flex-wrap -mx-3 mb-6' # Outer div with negative margin
            ),
            Div(  # Row for comment - Modified for alignment
                Div(
                    Field('comment', css_class='w-full'),
                    css_class='w-full px-3'  # Inner div with padding
                ),
                css_class='flex flex-wrap -mx-3 mb-6' # Outer div with negative margin
            ),
        ) 

    def clean_first_name(self):
        first_name = self.cleaned_data.get('first_name')
        if first_name and ' ' in first_name.strip():
            raise forms.ValidationError("First name must be a single word.")
        return first_name

    def clean_last_name(self):
        last_name = self.cleaned_data.get('last_name')
        if last_name and ' ' in last_name.strip():
            raise forms.ValidationError("Last name must be a single word.")
        return last_name

    def clean_telephone(self):
        telephone = self.cleaned_data.get('telephone')
        if telephone:
            # Check length first
            if len(telephone) < 10:
                raise forms.ValidationError("Telephone number must be at least 10 characters long.")

            # Check content (digits or leading +)
            phone_to_check = telephone
            if phone_to_check.startswith('+'):
                phone_to_check = phone_to_check[1:] # Check digits after '+'

            if not phone_to_check.isdigit():
                raise forms.ValidationError("Telephone number must contain only digits, with an optional leading '+'.")

        return telephone 