from django.db import models
from django.utils import timezone

# Create your models here.

class Owner(models.Model):
    last_name = models.CharField(max_length=100)
    first_name = models.CharField(max_length=100, null=True, blank=True)
    email = models.EmailField(null=True, blank=True)
    telephone = models.CharField(max_length=20, null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    comments = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.first_name or ''} {self.last_name}".strip()

# --- New Models --- #

class Species(models.Model):
    code = models.CharField(max_length=50, unique=True, help_text="Unique code for the species (e.g., CANINE, FELINE)")
    # Optional: Add a display name if needed, e.g.:
    # display_name = models.CharField(max_length=100, blank=True)

    class Meta:
        verbose_name_plural = "Species" # Correct pluralization in admin

    def __str__(self):
        return self.code

class Breed(models.Model):
    species = models.ForeignKey(Species, on_delete=models.CASCADE, related_name="breeds")
    name = models.CharField(max_length=100, help_text="Name of the breed")

    class Meta:
        unique_together = ('species', 'name') # Ensure breed names are unique within a species
        ordering = ['species__code', 'name'] # Default ordering

    def __str__(self):
        return f"{self.species.code} - {self.name}"

# --- Patient Model --- #

class Patient(models.Model):
    SEX_CHOICES = [
        ('M', 'Male'),
        ('F', 'Female'),
    ]

    owner = models.ForeignKey(Owner, on_delete=models.CASCADE, related_name="patients")
    name = models.CharField(max_length=100)
    species = models.ForeignKey(Species, on_delete=models.PROTECT) # Protect species from deletion if patients exist
    breed = models.ForeignKey(Breed, on_delete=models.PROTECT) # Protect breed from deletion if patients exist
    sex = models.CharField(max_length=1, choices=SEX_CHOICES)
    intact = models.BooleanField() # True if intact, False if neutered/spayed
    date_of_birth = models.DateField()
    weight = models.DecimalField(max_digits=5, decimal_places=2, help_text="Weight in kilograms") # e.g., 999.99 kg
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.species.code} - {self.breed.name})"

    class Meta:
        ordering = ['owner__last_name', 'owner__first_name', 'name'] # Default ordering

# --- Case Model --- #

class Case(models.Model):
    owner = models.ForeignKey(Owner, on_delete=models.CASCADE, related_name="cases")
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="cases")
    case_date = models.DateField(default=timezone.now, help_text="Date of the visit/case.")
    complaint = models.TextField(blank=True, help_text="Primary reason for the visit/consultation.")
    history = models.TextField(blank=True, help_text="Relevant medical history for this case.")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Case for {self.patient.name} ({self.owner.last_name}) - {self.case_date.strftime('%Y-%m-%d')}"

    class Meta:
        ordering = ['-case_date', '-updated_at'] # Order by case date first, then updated_at

# Make sure to run makemigrations and migrate after adding the model
