from django.shortcuts import render, get_object_or_404
from django.views.generic import ListView, View
from django.http import JsonResponse, HttpResponse
from django.forms.models import model_to_dict
# Remove serialize import if no longer needed elsewhere
# from django.core.serializers import serialize
import json
import csv
import io
from datetime import datetime
from django.utils import timezone
from django.db import transaction
from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
from django.db.models import Q
from django.db import IntegrityError
from django.views.decorators.http import require_http_methods
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt

from .models import Owner, Species, Breed, Patient, Case
from .forms import OwnerForm, PatientForm, CaseForm

# Create your views here.
def home(request):
    return render(request, 'home.html')

def manage(request):
    return render(request, 'manage.html')

# View to render the owner list page structure (template renders Vue app)
class OwnerListView(ListView):
    model = Owner
    template_name = 'owner_list.html'
    # Remove context logic, Vue will fetch data via API
    # context_object_name = 'owners_qs'
    # def get_context_data(...): ...

# --- API View for Paginated Owners (Modified) ---
class OwnerListCreateAPIView(View):
    DEFAULT_PER_PAGE = 20
    MAX_PER_PAGE = 100
    DEFAULT_FILTER_FIELDS = ['last_name', 'first_name', 'email', 'telephone', 'address', 'comments'] # Default fields to search

    def get(self, request, *args, **kwargs):
        # Get query parameters
        try:
            page = int(request.GET.get('page', 1))
            per_page = int(request.GET.get('per_page', self.DEFAULT_PER_PAGE))
        except ValueError:
            return JsonResponse({'success': False, 'error': 'Invalid page or per_page parameter.'}, status=400)

        # Validate per_page
        if per_page <= 0:
             per_page = self.DEFAULT_PER_PAGE
        elif per_page > self.MAX_PER_PAGE:
            per_page = self.MAX_PER_PAGE

        # Get filter parameters
        query = request.GET.get('query', '').strip()
        filter_fields = request.GET.getlist('filter_fields')
        if not filter_fields:
            filter_fields = self.DEFAULT_FILTER_FIELDS

        # Validate filter_fields against allowed fields
        allowed_filter_fields = set(self.DEFAULT_FILTER_FIELDS)
        valid_filter_fields = [f for f in filter_fields if f in allowed_filter_fields]
        if not valid_filter_fields and query: # Only error/default if query is present
            # Option 1: Error if query present but no valid fields selected
            # return JsonResponse({'success': False, 'error': 'Please select valid fields to search.'}, status=400)
            # Option 2: Default back to all searchable fields if query present
             valid_filter_fields = self.DEFAULT_FILTER_FIELDS

        # Get sort parameters
        default_sort_field = 'updated_at'
        allowed_sort_fields = {'last_name', 'first_name', 'email', 'telephone', 'updated_at'} # Add any other sortable fields
        sort_field = request.GET.get('sort', default_sort_field).lower()
        sort_direction = request.GET.get('direction', 'desc').lower()

        # Validate sort parameters
        if sort_field not in allowed_sort_fields:
            sort_field = default_sort_field
        if sort_direction not in ['asc', 'desc']:
            sort_direction = 'desc'

        # Get base queryset
        owner_queryset = Owner.objects.all()

        # Apply filters if query and valid fields are provided
        if query and valid_filter_fields:
            q_objects = Q()
            for field_name in valid_filter_fields:
                q_objects |= Q(**{f'{field_name}__icontains': query})
            owner_queryset = owner_queryset.filter(q_objects)

        # Apply dynamic ordering
        order_by_string = f"{'-' if sort_direction == 'desc' else ''}{sort_field}"
        # Add a secondary sort key (e.g., pk) for stable sorting if primary keys are equal
        owner_queryset = owner_queryset.order_by(order_by_string, 'pk')

        # Paginate
        paginator = Paginator(owner_queryset, per_page)
        try:
            owners_page = paginator.page(page)
        except PageNotAnInteger:
            # If page is not an integer, deliver first page.
            owners_page = paginator.page(1)
            page = 1
        except EmptyPage:
            # If page is out of range (e.g. 9999), deliver last page of results.
            owners_page = paginator.page(paginator.num_pages)
            page = paginator.num_pages

        # Serialize the data for the current page
        results = list(owners_page.object_list.values(
            'id', 'last_name', 'first_name', 'email', 'telephone', 'address', 'comments',
            'created_at', 'updated_at' # Include timestamps if needed
        ))

        # Prepare JSON response with data and metadata
        data = {
            'success': True,
            'page': page,
            'per_page': per_page,
            'total_pages': paginator.num_pages,
            'total_owners': paginator.count,
            'has_previous': owners_page.has_previous(),
            'has_next': owners_page.has_next(),
            'results': results,
        }
        return JsonResponse(data, safe=False) # safe=False needed for list serialization if not using dict wrapper

    # --- POST method added for CREATING owners ---
    def post(self, request, *args, **kwargs):
        try:
            # Load data from JSON request body
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'errors': {'__all__': 'Invalid JSON format'}}, status=400)

        # This post method is only for CREATION
        form = OwnerForm(data)

        if form.is_valid():
            owner = form.save()
            # Return the saved owner data as JSON (convert model instance to dict)
            return JsonResponse({'success': True, 'owner': model_to_dict(owner)}, status=201) # Use 201 Created status
        else:
            # Return form errors as JSON
            return JsonResponse({'success': False, 'errors': form.errors}, status=400)

# View to handle Owner Update via AJAX (Removed Create logic)
class OwnerCreateUpdateView(View):
    def post(self, request, pk): # Expect pk for updates
        # Ensure pk is provided for an update operation
        if not pk:
             return JsonResponse({'success': False, 'error': 'Owner ID (pk) is required for update.'}, status=400)

        try:
            # Load data from JSON request body
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'errors': {'__all__': 'Invalid JSON format'}}, status=400)

        # Fetch the existing owner instance
        owner = get_object_or_404(Owner, pk=pk)
        # Pass loaded data and the instance to the form for updating
        form = OwnerForm(data, instance=owner)

        if form.is_valid():
            owner = form.save()
            # Return the saved owner data as JSON (convert model instance to dict)
            return JsonResponse({'success': True, 'owner': model_to_dict(owner)})
        else:
            # Return form errors as JSON
            return JsonResponse({'success': False, 'errors': form.errors}, status=400)

# View to handle Owner Delete via AJAX
class OwnerDeleteView(View):
    def post(self, request, pk):
        owner = get_object_or_404(Owner, pk=pk)
        try:
            owner.delete()
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=500)

# View to get Owner details via AJAX (for pre-filling edit form)
class OwnerDetailView(View):
     def get(self, request, pk):
        owner = get_object_or_404(Owner, pk=pk)
        return JsonResponse(model_to_dict(owner))

# View to download the CSV template
class OwnerImportTemplateView(View):
    def get(self, request, *args, **kwargs):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="owner_import_template.csv"'

        writer = csv.writer(response)
        headers = ['last_name', 'first_name', 'email', 'telephone', 'address', 'comments', 'created_at']
        writer.writerow(headers)
        writer.writerow(['Doe', 'John', 'john.doe@example.com', '555-1234', '123 Main St', 'Optional notes', '2024-01-15 10:30:00'])

        return response

# View to preview the uploaded CSV
class OwnerImportPreviewView(View):
    PREVIEW_ROW_COUNT = 10

    def post(self, request, *args, **kwargs):
        if 'file' not in request.FILES:
            return JsonResponse({'success': False, 'error': 'No file uploaded.'}, status=400)

        file = request.FILES['file']
        if not file.name.lower().endswith('.csv'):
            return JsonResponse({'success': False, 'error': 'Invalid file type. Please upload a .csv file.'}, status=400)

        required_headers = {'last_name'}
        allowed_headers = {'last_name', 'first_name', 'email', 'telephone', 'address', 'comments', 'created_at'}
        total_record_count = 0
        preview_rows = []
        headers = []

        try:
            decoded_file = file.read().decode('utf-8-sig')
            io_string = io.StringIO(decoded_file)
            reader = csv.reader(io_string)

            # Read header
            try:
                headers = next(reader)
                headers = [h.strip().lower() for h in headers]
            except StopIteration: # Handle empty file
                 return JsonResponse({'success': False, 'error': 'CSV file is empty or contains only a header.'}, status=400)

            # Validate Headers
            actual_headers_set = set(headers)
            if not required_headers.issubset(actual_headers_set):
                missing = required_headers - actual_headers_set
                return JsonResponse({'success': False, 'error': f'Missing required columns: {", ".join(missing)}.'}, status=400)

            # Process rows: count all, preview first N
            for i, row in enumerate(reader):
                total_record_count += 1
                if i < self.PREVIEW_ROW_COUNT:
                    # Basic validation: check column count
                    if len(row) != len(headers):
                        return JsonResponse({'success': False, 'error': f'Row {i+2} has incorrect number of columns ({len(row)}). Expected {len(headers)}.'}, status=400)
                    preview_rows.append(row)

            # Check if any data rows were found
            if total_record_count == 0:
                 return JsonResponse({'success': False, 'error': 'CSV file contains only a header row.'}, status=400)

            preview_data = {
                'headers': headers,
                'rows': preview_rows
            }
            return JsonResponse({
                'success': True,
                'preview': preview_data,
                'total_records': total_record_count
             })

        except UnicodeDecodeError:
             return JsonResponse({'success': False, 'error': 'File encoding error. Please ensure the file is UTF-8 encoded.'}, status=400)
        except Exception as e:
            print(f"Error during preview: {e}") # Basic logging
            return JsonResponse({'success': False, 'error': 'An unexpected error occurred while reading the file.'}, status=500)

# View to execute the CSV import
class OwnerImportExecuteView(View):
    def post(self, request, *args, **kwargs):
        if 'file' not in request.FILES:
            return JsonResponse({'success': False, 'error': 'No file uploaded.'}, status=400)

        file = request.FILES['file']
        if not file.name.lower().endswith('.csv'):
            return JsonResponse({'success': False, 'error': 'Invalid file type.'}, status=400)

        allowed_headers = {'last_name', 'first_name', 'email', 'telephone', 'address', 'comments', 'created_at'}
        import_comment = "<Added through bulk import>"
        created_count = 0
        errors = []
        skipped_duplicates = 0 # Keep track of duplicates

        try:
            decoded_file = file.read().decode('utf-8-sig')
            io_string = io.StringIO(decoded_file)
            reader = csv.DictReader(io_string)

            reader.fieldnames = [name.strip().lower() for name in reader.fieldnames]

            actual_headers_set = set(reader.fieldnames)
            if 'last_name' not in actual_headers_set:
                 return JsonResponse({'success': False, 'error': 'Missing required column: last_name'}, status=400)

            owners_to_create = []
            current_time = timezone.now()

            # --- Optimization: Fetch existing relevant owners upfront? ---
            # For very large files, querying per row is inefficient.
            # Consider fetching relevant existing owners into memory if performance becomes an issue.
            # For now, we will query per row for simplicity.
            # existing_owners = {(o.last_name, o.first_name or '', o.email or '')
            #                    for o in Owner.objects.all()} # Example: Fetch all

            for i, row in enumerate(reader): # reader is DictReader
                row_num = i + 2
                owner_data = {}
                has_error = False

                # Prepare data and handle case sensitivity/whitespace
                ln = row.get('last_name', '').strip()
                fn = row.get('first_name', '').strip()
                em = row.get('email', '').strip()

                # Required field check
                if not ln:
                    errors.append(f"Row {row_num}: Missing required value for last_name.")
                    continue # Skip row

                # --- Uniqueness Check --- (Case-insensitive example)
                # Adjust filter based on how you want to handle nulls/blanks
                # Treat empty strings from CSV as null/blank for matching
                filter_kwargs = {
                    'last_name__iexact': ln,
                    'first_name__iexact': fn or '', # Match empty string if fn is empty
                    'email__iexact': em or ''      # Match empty string if em is empty
                }
                # Use filter().exists() for efficiency
                is_duplicate = Owner.objects.filter(**filter_kwargs).exists()

                # Alternative check using pre-fetched set (if implemented):
                # is_duplicate = (ln.lower(), (fn or '').lower(), (em or '').lower()) in existing_owners

                if is_duplicate:
                    skipped_duplicates += 1
                    # Optional: Add to errors list if you want to report skipped rows
                    # errors.append(f"Row {row_num}: Skipped duplicate owner ({ln}, {fn}, {em}).")
                    continue # Skip this row

                # --- Populate Owner Data (if not duplicate) ---
                owner_data['last_name'] = ln
                if fn: owner_data['first_name'] = fn
                if em: owner_data['email'] = em

                # Populate other allowed fields
                for header in allowed_headers - {'last_name', 'first_name', 'email', 'created_at'}:
                     if header in row:
                         value = row[header].strip()
                         if value:
                             owner_data[header] = value

                # Comments handling
                existing_comment = owner_data.get('comments', '')
                owner_data['comments'] = f"{existing_comment}\n{import_comment}".strip()

                # created_at handling
                created_at_str = row.get('created_at', '').strip()
                parsed_created_at = None
                if created_at_str:
                    try:
                        parsed_created_at = datetime.strptime(created_at_str, '%Y-%m-%d %H:%M:%S')
                        if timezone.is_aware(current_time):
                             parsed_created_at = timezone.make_aware(parsed_created_at, timezone.get_current_timezone())
                    except ValueError:
                        errors.append(f"Row {row_num}: Invalid format for created_at '{created_at_str}'. Expected YYYY-MM-DD HH:MM:SS.")
                        has_error = True

                if has_error:
                    continue

                owner = Owner(**owner_data)
                if parsed_created_at:
                    owner.created_at = parsed_created_at
                    owner.updated_at = parsed_created_at

                owners_to_create.append(owner)

            # --- Bulk Create & Response Handling --- (remains largely the same)
            if owners_to_create:
                try:
                    with transaction.atomic():
                        Owner.objects.bulk_create(owners_to_create)
                        created_count = len(owners_to_create)
                except Exception as e:
                    print(f"Bulk create error: {e}")
                    return JsonResponse({'success': False, 'error': 'Database error during bulk import.'}, status=500)

            # Adjust response message
            response_message = f"Import finished. Imported: {created_count} new owners."
            if skipped_duplicates > 0:
                response_message += f" Skipped: {skipped_duplicates} duplicate owners."

            if errors:
                error_summary = "\n".join(errors[:10])
                if len(errors) > 10:
                    error_summary += f"\n...and {len(errors) - 10} more errors."
                # Return success=False if there were validation errors, even if some were imported
                return JsonResponse({
                    'success': False,
                    'error': f'{response_message}\n\nErrors found:\n{error_summary}',
                    'imported_count': created_count,
                    'skipped_count': skipped_duplicates
                }, status=400)
            else:
                return JsonResponse({
                    'success': True,
                    'message': response_message,
                    'imported_count': created_count,
                    'skipped_count': skipped_duplicates
                })

        except UnicodeDecodeError:
             return JsonResponse({'success': False, 'error': 'File encoding error. Please ensure the file is UTF-8 encoded.'}, status=400)
        except Exception as e:
            print(f"Error during execute: {e}")
            return JsonResponse({'success': False, 'error': 'An unexpected error occurred while importing the file.'}, status=500)

# ==========================
# Patient Views & API
# ==========================

# View to render the patient list page structure
class PatientListView(ListView):
    model = Patient
    template_name = 'patient_list.html'
    # Vue app will handle data fetching

# API View for Paginated Patients
class PatientListAPIView(View):
    DEFAULT_PER_PAGE = 20
    MAX_PER_PAGE = 100
    # Default fields to search (add more as needed)
    DEFAULT_FILTER_FIELDS = ['name', 'owner__last_name', 'owner__first_name', 'species__code', 'breed__name']
    ALLOWED_SORT_FIELDS = {
        'name', 'owner__last_name', 'species__code', 'breed__name',
        'sex', 'intact', 'date_of_birth', 'updated_at',
        # Add aliases if needed, e.g., 'owner' : 'owner__last_name'
    }
    DEFAULT_SORT_FIELD = 'updated_at'

    def get(self, request, *args, **kwargs):
        # --- Parameter Parsing (Page, Per Page) ---
        try:
            page = int(request.GET.get('page', 1))
            per_page = int(request.GET.get('per_page', self.DEFAULT_PER_PAGE))
        except ValueError:
            return JsonResponse({'success': False, 'error': 'Invalid page or per_page parameter.'}, status=400)

        if per_page <= 0: per_page = self.DEFAULT_PER_PAGE
        elif per_page > self.MAX_PER_PAGE: per_page = self.MAX_PER_PAGE

        # --- Parameter Parsing (Minimal Owner List for Dropdown) ---
        minimal_owner_list = request.GET.get('minimal', 'false').lower() == 'true'
        if minimal_owner_list:
            # Override sorting/pagination for minimal list if needed
            owners_qs = Owner.objects.order_by('last_name', 'first_name')
            owners_data = list(owners_qs.values('id', 'last_name', 'first_name', 'email')) # Only required fields
            return JsonResponse({'success': True, 'results': owners_data}) # Return only results

        # --- Parameter Parsing (Filtering) ---
        query = request.GET.get('query', '').strip()
        filter_fields = request.GET.getlist('filter_fields')
        if not filter_fields:
            filter_fields = self.DEFAULT_FILTER_FIELDS
        
        # Validate filter_fields against allowed fields
        valid_filter_fields = [f for f in filter_fields if f in self.DEFAULT_FILTER_FIELDS]
        if not valid_filter_fields and query:
            valid_filter_fields = self.DEFAULT_FILTER_FIELDS

        # --- Parameter Parsing (Sorting) ---
        sort_field = request.GET.get('sort', self.DEFAULT_SORT_FIELD).lower()
        sort_direction = request.GET.get('direction', 'desc').lower()
        
        if sort_field not in self.ALLOWED_SORT_FIELDS:
            sort_field = self.DEFAULT_SORT_FIELD
        if sort_direction not in ['asc', 'desc']:
            sort_direction = 'desc'

        # --- Base Queryset & Prefetching ---
        patient_queryset = Patient.objects.select_related('owner', 'species', 'breed').all()

        # --- Apply Filters ---
        if query and valid_filter_fields:
            q_objects = Q()
            for field_name in valid_filter_fields:
                q_objects |= Q(**{f'{field_name}__icontains': query})
            patient_queryset = patient_queryset.filter(q_objects)

        # --- Apply Sorting ---
        # Handle related field sorting (owner__last_name requires secondary sort on first_name)
        order_by_list = []
        sort_prefix = '-' if sort_direction == 'desc' else ''

        if sort_field == 'owner__last_name':
            order_by_list.append(f"{sort_prefix}owner__last_name")
            order_by_list.append(f"{sort_prefix}owner__first_name") # Secondary sort for owner name
            order_by_list.append(f"{sort_prefix}name") # Tertiary sort by patient name
        else:
            order_by_list.append(f"{sort_prefix}{sort_field}")
        
        # Add pk for stable pagination
        if 'pk' not in [f.lstrip('-') for f in order_by_list]:
            order_by_list.append('pk')

        patient_queryset = patient_queryset.order_by(*order_by_list)

        # --- Paginate ---
        paginator = Paginator(patient_queryset, per_page)
        try:
            patients_page = paginator.page(page)
        except PageNotAnInteger:
            patients_page = paginator.page(1)
            page = 1
        except EmptyPage:
            patients_page = paginator.page(paginator.num_pages)
            page = paginator.num_pages
        
        # Check if requested page is valid after filtering
        if page > paginator.num_pages:
            page = paginator.num_pages if paginator.num_pages > 0 else 1
            patients_page = paginator.page(page)

        # --- Serialize Results ---
        results = []
        for patient in patients_page.object_list:
            results.append({
                'id': patient.id,
                'name': patient.name,
                'owner_id': patient.owner.id,
                'owner_name': f"{patient.owner.first_name or ''} {patient.owner.last_name}".strip(),
                'species_code': patient.species.code,
                'breed_id': patient.breed.id,
                'breed_name': patient.breed.name,
                'sex': patient.sex,
                'intact': patient.intact,
                'date_of_birth': patient.date_of_birth.isoformat() if patient.date_of_birth else None,
                'weight': str(patient.weight) if patient.weight is not None else None, # Send as string
                'created_at': patient.created_at.isoformat() if patient.created_at else None,
                'updated_at': patient.updated_at.isoformat() if patient.updated_at else None,
            })

        # --- Prepare JSON Response ---
        data = {
            'success': True,
            'page': page,
            'per_page': per_page,
            'total_pages': paginator.num_pages,
            'total_patients': paginator.count, # Changed
            'has_previous': patients_page.has_previous(),
            'has_next': patients_page.has_next(),
            'results': results,
        }
        return JsonResponse(data)

# View to handle Patient Create/Update via AJAX
class PatientCreateUpdateView(View):
    def post(self, request, pk=None):
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'errors': {'__all__': 'Invalid JSON format'}}, status=400)
        
        # We need to transform species code back to Species instance for the form
        species_code = data.get('species')
        if species_code:
            try:
                data['species'] = Species.objects.get(code=species_code)
            except Species.DoesNotExist:
                 return JsonResponse({'success': False, 'errors': {'species': [f'Invalid species code: {species_code}']}}, status=400)
        # Breed should be passed as ID from frontend, so no transformation needed for the form
        # Owner should be passed as ID from frontend

        if pk:
            patient = get_object_or_404(Patient, pk=pk)
            form = PatientForm(data, instance=patient)
        else:
            form = PatientForm(data)

        if form.is_valid():
            patient = form.save()
            # Return the saved patient data (simplified for now, can expand)
            return JsonResponse({'success': True, 'patient_id': patient.id})
        else:
            # Return form errors as JSON
            return JsonResponse({'success': False, 'errors': form.errors}, status=400)

# View to handle Patient Delete via AJAX
class PatientDeleteView(View):
     def post(self, request, pk):
        patient = get_object_or_404(Patient, pk=pk)
        try:
            patient.delete()
            return JsonResponse({'success': True})
        except Exception as e:
            # Log error e
            return JsonResponse({'success': False, 'error': str(e)}, status=500)

# View to get Patient details via AJAX (for pre-filling edit form)
class PatientDetailView(View):
     def get(self, request, pk):
        patient = get_object_or_404(Patient.objects.select_related('owner', 'species', 'breed'), pk=pk)
        # Return data in a format usable by the Vue form
        data = {
            'id': patient.id,
            'owner': patient.owner.id, # Send owner ID
            'name': patient.name,
            'species': patient.species.code, # Send species code
            'breed': patient.breed.id, # Send breed ID
            'sex': patient.sex,
            'intact': patient.intact,
            'date_of_birth': patient.date_of_birth.isoformat() if patient.date_of_birth else None,
            'weight': str(patient.weight) if patient.weight is not None else None,
            # Include related names if needed by view modal (though Vue can format)
            'owner_name': f"{patient.owner.first_name or ''} {patient.owner.last_name}".strip(),
            'species_code': patient.species.code,
            'breed_name': patient.breed.name,
            'created_at': patient.created_at.isoformat() if patient.created_at else None,
            'updated_at': patient.updated_at.isoformat() if patient.updated_at else None,
        }
        return JsonResponse(data)

# ==========================
# Species API Views
# ==========================

# Combined View for List (GET) and Create (POST)
class SpeciesListCreateView(View):
    # GET method from original SpeciesListView
    def get(self, request, *args, **kwargs):
        species = Species.objects.all().order_by('code').values('code')
        return JsonResponse(list(species), safe=False)

    # POST method from original SpeciesCreateView
    def post(self, request, *args, **kwargs):
        try:
            data = json.loads(request.body)
            code = data.get('code')

            if not code:
                return JsonResponse({'error': 'Species code is required.'}, status=400)

            code = code.strip().upper()
            if not code:
                 return JsonResponse({'error': 'Species code cannot be empty.'}, status=400)
            
            # Basic validation: Allow only letters
            if not code.isalpha():
                return JsonResponse({'error': 'Species code should only contain letters.'}, status=400)

            try:
                new_species = Species.objects.create(code=code)
                return JsonResponse({'code': new_species.code}, status=201)
            except IntegrityError:
                return JsonResponse({'error': f'Species code "{code}" already exists.'}, status=400)

        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON format.'}, status=400)
        except Exception as e:
            # Log the exception e
            print(f"Error creating species: {e}") # Added basic logging
            return JsonResponse({'error': 'An unexpected error occurred.'}, status=500)

# Remove csrf_exempt as token is sent via X-CSRFToken header in AJAX
# @method_decorator(csrf_exempt, name='dispatch')
class SpeciesDeleteView(View):
    def delete(self, request, code, *args, **kwargs):
        try:
            species_to_delete = Species.objects.get(code=code)

            # Check if any breeds are associated with this species
            if Breed.objects.filter(species=species_to_delete).exists():
                return JsonResponse({
                    'error': f'Cannot delete species "{code}" because it has associated breeds.'
                }, status=400)

            species_to_delete.delete()
            return JsonResponse({'message': f'Species "{code}" deleted successfully.'}, status=200) # Use 200 OK for successful DELETE

        except Species.DoesNotExist:
            return JsonResponse({'error': f'Species "{code}" not found.'}, status=404)
        except Exception as e:
            # Log the exception e
            return JsonResponse({'error': 'An unexpected error occurred.'}, status=500)

# ==========================
# Breed API Views
# ==========================

class BreedListCreateView(View):
    DEFAULT_PER_PAGE = 25
    MAX_PER_PAGE = 100

    # GET: List breeds (filtered, searched, paginated)
    def get(self, request, *args, **kwargs):
        species_code = request.GET.get('species_code')
        search_query = request.GET.get('search', '').strip()
        try:
            page = int(request.GET.get('page', 1))
            per_page = int(request.GET.get('per_page', self.DEFAULT_PER_PAGE))
        except ValueError:
            return JsonResponse({'success': False, 'error': 'Invalid page or per_page parameter.'}, status=400)

        # Validate per_page
        if per_page <= 0: per_page = self.DEFAULT_PER_PAGE
        elif per_page > self.MAX_PER_PAGE: per_page = self.MAX_PER_PAGE

        if not species_code:
            return JsonResponse({'success': False, 'error': 'Species code is required.'}, status=400)

        try:
            target_species = Species.objects.get(code=species_code.upper())
        except Species.DoesNotExist:
             return JsonResponse({'success': False, 'error': f'Species "{species_code}" not found.'}, status=404)

        # Base queryset for the selected species
        breed_queryset = Breed.objects.filter(species=target_species)

        # Apply search filter if query provided
        if search_query:
            breed_queryset = breed_queryset.filter(name__icontains=search_query)

        # Apply ordering
        breed_queryset = breed_queryset.order_by('name')

        # Paginate
        paginator = Paginator(breed_queryset, per_page)
        try:
            breeds_page = paginator.page(page)
        except PageNotAnInteger:
            breeds_page = paginator.page(1)
            page = 1
        except EmptyPage:
            breeds_page = paginator.page(paginator.num_pages)
            page = paginator.num_pages
        
        # Check if requested page is valid after filtering
        if page > paginator.num_pages:
            page = paginator.num_pages if paginator.num_pages > 0 else 1
            breeds_page = paginator.page(page)

        results = list(breeds_page.object_list.values('id', 'name')) # Only need id and name

        data = {
            'success': True,
            'page': page,
            'per_page': per_page,
            'total_pages': paginator.num_pages,
            'total_breeds': paginator.count,
            'has_previous': breeds_page.has_previous(),
            'has_next': breeds_page.has_next(),
            'results': results,
        }
        return JsonResponse(data)

    # POST: Create a new breed
    def post(self, request, *args, **kwargs):
        try:
            data = json.loads(request.body)
            species_code = data.get('species_code')
            name = data.get('name')

            if not species_code or not name:
                return JsonResponse({'error': 'Species code and breed name are required.'}, status=400)

            name = name.strip()
            if not name:
                return JsonResponse({'error': 'Breed name cannot be empty.'}, status=400)

            try:
                target_species = Species.objects.get(code=species_code.upper())
            except Species.DoesNotExist:
                return JsonResponse({'error': f'Species "{species_code}" not found.'}, status=404)
            
            # Check for duplicate breed name within the same species
            if Breed.objects.filter(species=target_species, name__iexact=name).exists():
                 return JsonResponse({'error': f'Breed "{name}" already exists for species "{species_code}".'}, status=400)

            try:
                new_breed = Breed.objects.create(species=target_species, name=name)
                # Return the created breed's id and name
                return JsonResponse({'id': new_breed.id, 'name': new_breed.name}, status=201)
            except IntegrityError as e: # Catch potential db-level constraints
                return JsonResponse({'error': f'Could not create breed. Database error: {e}'}, status=400)

        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON format.'}, status=400)
        except Exception as e:
            print(f"Error creating breed: {e}")
            return JsonResponse({'error': 'An unexpected error occurred.'}, status=500)


class BreedDeleteView(View):
    def delete(self, request, pk, *args, **kwargs):
        try:
            breed_to_delete = Breed.objects.get(pk=pk)
            breed_name = breed_to_delete.name # Get name for message
            species_code = breed_to_delete.species.code # Get species for message
            
            # Future check: Prevent deletion if breed is used by Patients
            # if Patient.objects.filter(breed=breed_to_delete).exists():
            #     return JsonResponse({'error': f'Cannot delete breed "{breed_name}" because it is assigned to patients.'}, status=400)
            
            breed_to_delete.delete()
            return JsonResponse({'message': f'Breed "{breed_name}" (Species: {species_code}) deleted successfully.'}, status=200)

        except Breed.DoesNotExist:
            return JsonResponse({'error': 'Breed not found.'}, status=404)
        except Exception as e:
            print(f"Error deleting breed: {e}")
            return JsonResponse({'error': 'An unexpected error occurred.'}, status=500)

# ==========================
# Patient Import Views
# ==========================

class PatientImportTemplateView(View):
    def get(self, request, *args, **kwargs):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="patient_import_template.csv"'

        writer = csv.writer(response)
        # Combine Owner and Patient fields
        # REQUIRED Owner: last_name
        # REQUIRED Patient: name, species_code, breed_name, sex, intact, weight, EITHER date_of_birth OR age_years
        headers = [
            # Owner Fields (Required last_name)
            'last_name', 'first_name', 'email', 'telephone', 'address', 'owner_comments',
            # Patient Fields (All required except one of dob/age)
            'patient_name', 'species_code', 'breed_name', 'sex', 'intact', 'date_of_birth', 'age_years', 'weight_kg'
        ]
        writer.writerow(headers)
        # Example row
        writer.writerow([
            'Smith', 'Jane', 'jane.s@example.com', '555-5678', '456 Oak Ave', 'New client',
            'Buddy', 'DOG', 'Labrador Retriever', 'M', 'true', '2020-05-10', '', '30.5'
        ])
        writer.writerow([
            'Jones', 'Robert', 'rob.j@mail.net', '', '', '',
            'Whiskers', 'CAT', 'Domestic Shorthair', 'F', 'false', '', '5', '4.2'
        ])

        return response


class PatientImportPreviewView(View):
    PREVIEW_ROW_COUNT = 10

    def post(self, request, *args, **kwargs):
        if 'file' not in request.FILES:
            return JsonResponse({'success': False, 'error': 'No file uploaded.'}, status=400)

        file = request.FILES['file']
        if not file.name.lower().endswith('.csv'):
            return JsonResponse({'success': False, 'error': 'Invalid file type. Please upload a .csv file.'}, status=400)

        # Define required and allowed headers
        required_headers = {
            'last_name', 'patient_name', 'species_code', 'breed_name', 'sex', 'intact', 'weight_kg'
        }
        # Need at least one of date_of_birth or age_years
        date_or_age_headers = {'date_of_birth', 'age_years'}
        allowed_headers = {
            'last_name', 'first_name', 'email', 'telephone', 'address', 'owner_comments',
            'patient_name', 'species_code', 'breed_name', 'sex', 'intact', 'date_of_birth', 'age_years', 'weight_kg'
        }

        total_record_count = 0
        preview_rows = []
        headers = []

        try:
            decoded_file = file.read().decode('utf-8-sig')
            io_string = io.StringIO(decoded_file)
            reader = csv.reader(io_string)

            # Read header
            try:
                headers = next(reader)
                headers = [h.strip().lower() for h in headers]
            except StopIteration:
                 return JsonResponse({'success': False, 'error': 'CSV file is empty or contains only a header.'}, status=400)

            # Validate Headers
            actual_headers_set = set(headers)
            if not required_headers.issubset(actual_headers_set):
                missing = required_headers - actual_headers_set
                return JsonResponse({'success': False, 'error': f'Missing required columns: {", ".join(missing)}.'}, status=400)

            if not any(h in actual_headers_set for h in date_or_age_headers):
                 return JsonResponse({'success': False, 'error': 'Missing required column: Must include either "date_of_birth" or "age_years".'}, status=400)

            # Optional: Check for disallowed headers? For now, we just ignore extra columns during processing.

            # Process rows: count all, preview first N
            for i, row in enumerate(reader):
                total_record_count += 1
                if i < self.PREVIEW_ROW_COUNT:
                    # Basic validation: check column count
                    if len(row) != len(headers):
                        return JsonResponse({'success': False, 'error': f'Row {i+2} has incorrect number of columns ({len(row)}). Expected {len(headers)}.'}, status=400)
                    preview_rows.append(row)

            # Check if any data rows were found
            if total_record_count == 0:
                 return JsonResponse({'success': False, 'error': 'CSV file contains only a header row.'}, status=400)

            preview_data = {
                'headers': headers, # Return the actual headers found in the file
                'rows': preview_rows
            }
            return JsonResponse({
                'success': True,
                'preview': preview_data,
                'total_records': total_record_count
             })

        except UnicodeDecodeError:
             return JsonResponse({'success': False, 'error': 'File encoding error. Please ensure the file is UTF-8 encoded.'}, status=400)
        except Exception as e:
            print(f"Error during patient import preview: {e}") # Basic logging
            return JsonResponse({'success': False, 'error': 'An unexpected error occurred while reading the file.'}, status=500)


class PatientImportExecuteView(View):
    def post(self, request, *args, **kwargs):
        if 'file' not in request.FILES:
            return JsonResponse({'success': False, 'error': 'No file uploaded.'}, status=400)

        file = request.FILES['file']
        if not file.name.lower().endswith('.csv'):
            return JsonResponse({'success': False, 'error': 'Invalid file type.'}, status=400)

        import_comment = "<Patient and Owner data added through bulk import>"
        created_owners = 0
        updated_owners = 0
        created_patients = 0
        skipped_patients = 0
        errors = []

        # Cache species and breeds to reduce DB hits
        species_cache = {s.code: s for s in Species.objects.all()}
        breed_cache = {(b.species.code, b.name.lower()): b for b in Breed.objects.select_related('species').all()}
        # Cache owners found/created during import to avoid repeated DB checks within the same file
        owner_cache = {} # Key: (last_name_lower, first_name_lower, email_lower), Value: Owner instance

        try:
            decoded_file = file.read().decode('utf-8-sig')
            io_string = io.StringIO(decoded_file)
            reader = csv.DictReader(io_string)

            # Normalize field names from the file header
            reader.fieldnames = [name.strip().lower() for name in reader.fieldnames]
            actual_headers = set(reader.fieldnames)

            # Re-validate headers required for execution
            required_headers = {'last_name', 'patient_name', 'species_code', 'breed_name', 'sex', 'intact', 'weight_kg'}
            if not required_headers.issubset(actual_headers):
                missing = required_headers - actual_headers
                return JsonResponse({'success': False, 'error': f'Execution failed: Missing required columns: {", ".join(missing)}.'}, status=400)
            if not ('date_of_birth' in actual_headers or 'age_years' in actual_headers):
                return JsonResponse({'success': False, 'error': 'Execution failed: Missing required column (date_of_birth or age_years).'}, status=400)

            patients_to_create = []
            owners_to_update_fields = {} # owner_id: {field: value} - track updates for found owners
            today = timezone.localdate() # Get today's date for age calculation

            with transaction.atomic(): # Wrap the whole process in a transaction
                for i, row in enumerate(reader):
                    row_num = i + 2
                    try:
                        # --- 1. Extract and Validate Owner Data ---
                        owner_ln = row.get('last_name', '').strip()
                        owner_fn = row.get('first_name', '').strip()
                        owner_em = row.get('email', '').strip()
                        owner_tel = row.get('telephone', '').strip()
                        owner_addr = row.get('address', '').strip()
                        owner_comm = row.get('owner_comments', '').strip()

                        if not owner_ln:
                            errors.append(f"Row {row_num}: Missing required owner field: last_name.")
                            continue

                        # --- 2. Find or Prepare Owner ---
                        owner_key = (owner_ln.lower(), owner_fn.lower(), owner_em.lower())
                        owner = owner_cache.get(owner_key)
                        owner_created_this_import = False

                        if not owner:
                            # Query DB using case-insensitive match
                            filter_kwargs = {
                                'last_name__iexact': owner_ln,
                                'first_name__iexact': owner_fn or '',
                                'email__iexact': owner_em or ''
                            }
                            try:
                                owner = Owner.objects.get(**filter_kwargs)
                                # Owner found in DB, potentially update fields
                                update_needed = False
                                if owner_tel and owner.telephone != owner_tel:
                                    owners_to_update_fields.setdefault(owner.id, {})['telephone'] = owner_tel
                                    update_needed = True
                                if owner_addr and owner.address != owner_addr:
                                     owners_to_update_fields.setdefault(owner.id, {})['address'] = owner_addr
                                     update_needed = True
                                # Append import comment if new comments provided
                                if owner_comm and import_comment not in owner.comments:
                                     new_comment = f"{owner.comments}\n{import_comment}\n{owner_comm}".strip()
                                     owners_to_update_fields.setdefault(owner.id, {})['comments'] = new_comment
                                     update_needed = True
                                elif import_comment not in owner.comments: # Append import comment even if no new comment in file
                                    new_comment = f"{owner.comments}\n{import_comment}".strip()
                                    owners_to_update_fields.setdefault(owner.id, {})['comments'] = new_comment
                                    update_needed = True

                                if update_needed and owner.id not in owners_to_update_fields.get(owner.id, {}): # Check if we added fields
                                     # Only count as updated if fields were actually added to the dict
                                     # This logic might need refinement depending on how updates are counted
                                     pass # Update count handled later

                            except Owner.DoesNotExist:
                                # Create new owner instance (don't save yet)
                                owner_data = {
                                    'last_name': owner_ln,
                                    'first_name': owner_fn,
                                    'email': owner_em,
                                    'telephone': owner_tel,
                                    'address': owner_addr,
                                    'comments': f"{owner_comm}\n{import_comment}".strip()
                                }
                                owner = Owner(**owner_data)
                                owner.save() # Save immediately to get an ID for the patient FK
                                created_owners += 1
                                owner_created_this_import = True
                            except Owner.MultipleObjectsReturned:
                                errors.append(f"Row {row_num}: Found multiple existing owners matching ({owner_ln}, {owner_fn}, {owner_em}). Skipping.")
                                continue

                            owner_cache[owner_key] = owner # Add found/created owner to cache

                        # --- 3. Extract and Validate Patient Data ---
                        patient_name = row.get('patient_name', '').strip()
                        species_code = row.get('species_code', '').strip().upper()
                        breed_name = row.get('breed_name', '').strip()
                        sex = row.get('sex', '').strip().upper()
                        intact_str = row.get('intact', '').strip().lower()
                        dob_str = row.get('date_of_birth', '').strip()
                        age_str = row.get('age_years', '').strip()
                        weight_str = row.get('weight_kg', '').strip()

                        # Required patient fields check
                        if not all([patient_name, species_code, breed_name, sex, intact_str, weight_str]):
                            errors.append(f"Row {row_num}: Missing required patient field(s) (name, species, breed, sex, intact, weight).")
                            continue
                        if not dob_str and not age_str:
                             errors.append(f"Row {row_num}: Missing required patient field (date_of_birth or age_years).")
                             continue

                        # --- 4. Process Patient Fields ---
                        # Species
                        species = species_cache.get(species_code)
                        if not species:
                            # Try creating species if not found? Or error out? Let's error for now.
                            errors.append(f"Row {row_num}: Species code '{species_code}' not found in database.")
                            continue
                            # Alternative: Create on the fly
                            # try:
                            #     species = Species.objects.create(code=species_code)
                            #     species_cache[species_code] = species
                            # except IntegrityError:
                            #     errors.append(f"Row {row_num}: Error creating new species '{species_code}'.")
                            #     continue

                        # Breed
                        breed_key = (species_code, breed_name.lower())
                        breed = breed_cache.get(breed_key)
                        if not breed:
                             # Try finding case-insensitive first, then create if not found
                            try:
                                breed = Breed.objects.get(species=species, name__iexact=breed_name)
                                breed_cache[breed_key] = breed # Add found breed to cache
                            except Breed.DoesNotExist:
                                # Create new breed
                                try:
                                    breed = Breed.objects.create(species=species, name=breed_name)
                                    breed_cache[breed_key] = breed
                                except IntegrityError:
                                     errors.append(f"Row {row_num}: Error creating new breed '{breed_name}' for species '{species_code}'.")
                                     continue

                        # Sex
                        if sex not in ['M', 'F', 'U']: # Assuming U for Unknown/Unspecified
                             errors.append(f"Row {row_num}: Invalid value for sex '{sex}'. Use M, F, or U.")
                             continue

                        # Intact (Handle variations: true/false, yes/no, 1/0)
                        intact = None
                        if intact_str in ['true', 'yes', '1']: intact = True
                        elif intact_str in ['false', 'no', '0']: intact = False
                        else:
                            errors.append(f"Row {row_num}: Invalid value for intact '{intact_str}'. Use true/false, yes/no, or 1/0.")
                            continue

                         # Weight
                        try:
                            weight_kg = float(weight_str)
                            if weight_kg < 0: raise ValueError("Weight cannot be negative")
                        except ValueError:
                             errors.append(f"Row {row_num}: Invalid numeric value for weight_kg '{weight_str}'.")
                             continue

                        # Date of Birth / Age
                        dob = None
                        if dob_str:
                            try:
                                dob = datetime.strptime(dob_str, '%Y-%m-%d').date()
                            except ValueError:
                                # If DOB format is invalid, check if age is provided
                                if age_str:
                                     try:
                                         age_years = float(age_str)
                                         if age_years < 0: raise ValueError("Age cannot be negative")
                                         # Calculate approximate DOB based on age
                                         dob = today - timezone.timedelta(days=age_years * 365.25)
                                     except ValueError:
                                         errors.append(f"Row {row_num}: Invalid date_of_birth '{dob_str}' AND invalid numeric age_years '{age_str}'.")
                                         continue
                                else:
                                    # DOB invalid, no age provided
                                    errors.append(f"Row {row_num}: Invalid format for date_of_birth '{dob_str}'. Expected YYYY-MM-DD.")
                                    continue
                        elif age_str: # No DOB provided, use age
                             try:
                                age_years = float(age_str)
                                if age_years < 0: raise ValueError("Age cannot be negative")
                                dob = today - timezone.timedelta(days=age_years * 365.25)
                             except ValueError:
                                 errors.append(f"Row {row_num}: Invalid numeric value for age_years '{age_str}'.")
                                 continue
                        else:
                             # Should have been caught earlier, but defensively check
                             errors.append(f"Row {row_num}: Missing date_of_birth or age_years.")
                             continue

                        # --- 5. Check Patient Uniqueness ---
                        # Unique based on owner, name (case-insensitive), species, breed, dob
                        patient_filter = {
                            'owner': owner,
                            'name__iexact': patient_name,
                            'species': species,
                            'breed': breed,
                            'date_of_birth': dob
                        }
                        if Patient.objects.filter(**patient_filter).exists():
                            skipped_patients += 1
                            # Optional: Add to errors if you want to report skipped duplicates
                            # errors.append(f"Row {row_num}: Skipped duplicate patient record.")
                            continue

                        # --- 6. Prepare Patient for Bulk Create ---
                        patient_data = {
                             'owner': owner,
                             'name': patient_name,
                             'species': species,
                             'breed': breed,
                             'sex': sex,
                             'intact': intact,
                             'date_of_birth': dob,
                             'weight': weight_kg,
                         }
                        patients_to_create.append(Patient(**patient_data))

                    except Exception as e:
                        # Catch unexpected errors during row processing
                        errors.append(f"Row {row_num}: Unexpected error processing row: {e}")
                        print(f"Row {row_num} Error: {e}") # Log the specific error

                # --- End of row loop ---

                # --- 7. Bulk Create Patients ---
                if patients_to_create:
                    try:
                        Patient.objects.bulk_create(patients_to_create)
                        created_patients = len(patients_to_create)
                    except Exception as e:
                        # If bulk create fails, the transaction should roll back owners created in this run
                        print(f"Patient bulk create error: {e}")
                        raise IntegrityError(f"Database error during patient bulk import: {e}") # Reraise to trigger rollback

                # --- 8. Bulk Update Owners (outside the main loop) ---
                owners_to_batch_update = []
                updated_owner_ids = set()
                for owner_id, fields_to_update in owners_to_update_fields.items():
                    if fields_to_update: # Only update if there are changes
                        owner_instance = Owner.objects.get(pk=owner_id) # Fetch instance again
                        for field, value in fields_to_update.items():
                             setattr(owner_instance, field, value)
                        owners_to_batch_update.append(owner_instance)
                        updated_owner_ids.add(owner_id)

                if owners_to_batch_update:
                    try:
                        Owner.objects.bulk_update(owners_to_batch_update, ['telephone', 'address', 'comments'])
                        updated_owners = len(updated_owner_ids)
                    except Exception as e:
                         print(f"Owner bulk update error: {e}")
                         # Don't necessarily rollback everything if only owner update fails,
                         # but report it as an error. Patients might already be created.
                         errors.append(f"Warning: Failed to update some existing owner records: {e}")


            # --- Transaction committed successfully here ---

            # --- 9. Prepare Response ---
            response_message = f"Import finished. Created: {created_patients} patients."
            if created_owners > 0:
                response_message += f" Created {created_owners} new owners."
            if updated_owners > 0:
                 response_message += f" Updated {updated_owners} existing owners."
            if skipped_patients > 0:
                response_message += f" Skipped: {skipped_patients} duplicate/existing patients."

            if errors:
                error_summary = "\n".join(errors[:20]) # Show more errors for patient import
                if len(errors) > 20:
                    error_summary += f"\n...and {len(errors) - 20} more errors."
                # Consider success=False if *any* errors occurred, even if some imports succeeded.
                return JsonResponse({
                    'success': False, # Indicate partial failure/errors
                    'error': f'{response_message}\n\nErrors/Warnings found:\n{error_summary}',
                    'created_patients': created_patients,
                    'created_owners': created_owners,
                    'updated_owners': updated_owners,
                    'skipped_patients': skipped_patients
                }, status=400) # Bad request due to data errors
            else:
                return JsonResponse({
                    'success': True,
                    'message': response_message,
                    'created_patients': created_patients,
                    'created_owners': created_owners,
                    'updated_owners': updated_owners,
                    'skipped_patients': skipped_patients
                })

        except UnicodeDecodeError:
             return JsonResponse({'success': False, 'error': 'File encoding error. Please ensure the file is UTF-8 encoded.'}, status=400)
        except IntegrityError as db_error: # Catch transaction rollback errors
             return JsonResponse({'success': False, 'error': f'Database error during import: {db_error}. Import cancelled.'}, status=500)
        except Exception as e:
            print(f"Error during patient import execute: {e}")
            import traceback
            traceback.print_exc() # Print full traceback for debugging
            return JsonResponse({'success': False, 'error': f'An unexpected server error occurred: {e}'}, status=500)

# ==========================
# Case Views & API
# ==========================

# View to render the case creation page structure
class CreateCaseView(View):
    def get(self, request, *args, **kwargs):
        # This view just renders the template. Vue.js will handle the interactions.
        return render(request, 'case_create.html')

# API View for creating a new Case
class CaseCreateAPIView(View):
    def post(self, request, *args, **kwargs):
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'errors': {'__all__': 'Invalid JSON format'}}, status=400)

        # Basic check for required IDs (although form also checks relationships)
        owner_id = data.get('owner')
        patient_id = data.get('patient')

        if not owner_id or not patient_id:
            return JsonResponse({'success': False, 'errors': {'__all__': 'Owner and Patient are required.'}}, status=400)

        # Validate Owner and Patient exist (optional but good practice)
        try:
            Owner.objects.get(pk=owner_id)
        except Owner.DoesNotExist:
             return JsonResponse({'success': False, 'errors': {'owner': ['Invalid Owner ID.']}}, status=400)
        try:
            # Important: Ensure the patient belongs to the specified owner
            patient = Patient.objects.get(pk=patient_id, owner_id=owner_id)
        except Patient.DoesNotExist:
             return JsonResponse({'success': False, 'errors': {'patient': ['Invalid Patient ID for the selected Owner.']}}, status=400)

        # Instantiate the form with the data
        form = CaseForm(data)

        if form.is_valid():
            try:
                case = form.save()
                # Optionally return more case details if needed by the frontend
                return JsonResponse({'success': True, 'case_id': case.id, 'case_date': case.case_date}, status=201)
            except Exception as e:
                 # Log the exception e
                 print(f"Error saving case: {e}")
                 return JsonResponse({'success': False, 'errors': {'__all__': 'An error occurred while saving the case.'}}, status=500)
        else:
            # Return form validation errors
            return JsonResponse({'success': False, 'errors': form.errors}, status=400)
