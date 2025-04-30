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

from .models import Owner
from .forms import OwnerForm

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
class OwnerListAPIView(View):
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

        # Get base queryset
        owner_queryset = Owner.objects.all()

        # Apply filters if query and valid fields are provided
        if query and valid_filter_fields:
            q_objects = Q()
            for field_name in valid_filter_fields:
                q_objects |= Q(**{f'{field_name}__icontains': query})
            owner_queryset = owner_queryset.filter(q_objects)

        # Apply ordering
        owner_queryset = owner_queryset.order_by('last_name', 'first_name')

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

# View to handle Owner Create/Update via AJAX
class OwnerCreateUpdateView(View):
    def post(self, request, pk=None):
        try:
            # Load data from JSON request body
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'errors': {'__all__': 'Invalid JSON format'}}, status=400)

        if pk:
            owner = get_object_or_404(Owner, pk=pk)
            # Pass loaded data to the form instance
            form = OwnerForm(data, instance=owner)
        else:
            # Pass loaded data to the form for creation
            form = OwnerForm(data)

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
