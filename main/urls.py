from django.urls import path, include
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('owners/', views.OwnerListView.as_view(), name='owner-list'),
    path('manage/', views.manage, name='manage'),

    # API URLs for Owner CRUD (AJAX)
    path('api/owners/', views.OwnerListAPIView.as_view(), name='owner-list-api'),
    path('api/owners/', views.OwnerCreateUpdateView.as_view(), name='owner-create'),
    path('api/owners/<int:pk>/', views.OwnerDetailView.as_view(), name='owner-detail'),
    path('api/owners/<int:pk>/update/', views.OwnerCreateUpdateView.as_view(), name='owner-update'),
    path('api/owners/<int:pk>/delete/', views.OwnerDeleteView.as_view(), name='owner-delete'),

    # URLs for Owner Import
    path('manage/owners/import/template/', views.OwnerImportTemplateView.as_view(), name='owner-import-template'),
    path('manage/owners/import/preview/', views.OwnerImportPreviewView.as_view(), name='owner-import-preview'),
    path('manage/owners/import/execute/', views.OwnerImportExecuteView.as_view(), name='owner-import-execute'),

    # Species API (Corrected using single view for List/Create)
    path('api/species/', views.SpeciesListCreateView.as_view(), name='species-list-create'), # Handles GET & POST
    path('api/species/<str:code>/', views.SpeciesDeleteView.as_view(), name='species-delete'), # Handles DELETE

    # Breed API
    path('api/breeds/', views.BreedListCreateView.as_view(), name='breed-list-create'), # Handles GET (list) & POST (create)
    path('api/breeds/<int:pk>/', views.BreedDeleteView.as_view(), name='breed-delete'),   # Handles DELETE

    # Patient URLs
    path('patients/', views.PatientListView.as_view(), name='patient-list'),
    path('api/patients/', views.PatientListAPIView.as_view(), name='patient-list-api'),
    path('api/patients/create/', views.PatientCreateUpdateView.as_view(), name='patient-create'),
    path('api/patients/<int:pk>/', views.PatientDetailView.as_view(), name='patient-detail'),
    path('api/patients/<int:pk>/update/', views.PatientCreateUpdateView.as_view(), name='patient-update'),
    path('api/patients/<int:pk>/delete/', views.PatientDeleteView.as_view(), name='patient-delete'),

    # URLs for Patient Import
    path('manage/patients/import/template/', views.PatientImportTemplateView.as_view(), name='patient-import-template'),
    path('manage/patients/import/preview/', views.PatientImportPreviewView.as_view(), name='patient-import-preview'),
    path('manage/patients/import/execute/', views.PatientImportExecuteView.as_view(), name='patient-import-execute'),
]
