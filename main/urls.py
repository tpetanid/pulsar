from django.urls import path
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
]
