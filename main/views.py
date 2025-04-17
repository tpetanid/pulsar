from django.shortcuts import render, redirect, get_object_or_404
from django.views.generic import ListView, CreateView, UpdateView, DeleteView
from django.urls import reverse_lazy
from .models import Owner
from .forms import OwnerForm

# Create your views here.

def index(request):
    return render(request, 'index.html')

class OwnerListView(ListView):
    model = Owner
    template_name = 'main/owner_list.html'
    context_object_name = 'owners'

class OwnerCreateView(CreateView):
    model = Owner
    form_class = OwnerForm
    template_name = 'main/owner_form.html'
    success_url = reverse_lazy('owner_list')

class OwnerUpdateView(UpdateView):
    model = Owner
    form_class = OwnerForm
    template_name = 'main/owner_form.html'
    success_url = reverse_lazy('owner_list')

class OwnerDeleteView(DeleteView):
    model = Owner
    template_name = 'main/owner_confirm_delete.html'
    success_url = reverse_lazy('owner_list')
