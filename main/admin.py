from django.contrib import admin
from .models import Owner, Species, Breed

# Register your models here.
admin.site.register(Owner)
admin.site.register(Species)
admin.site.register(Breed)
