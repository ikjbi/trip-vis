// Trip Planner Application

// Global variables
let map;
let markers = [];
let routingControl = null;
let currentMarkerPosition = null;
let tripData = {
    id: Date.now(),
    name: '',
    startDate: null,
    endDate: null,
    destinations: []
};
let allTrips = [];
let currentTripId = null;

// Google API variables
let isGoogleApiInitialized = false;
let isUserSignedIn = false;
const API_KEY = '';  // This is just a placeholder, user will need to replace this
const CLIENT_ID = '739139493324-osdlctn8hcr75h2fs074iqcddl74hgfi.apps.googleusercontent.com';  // This is just a placeholder, user will need to replace this
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const APP_FOLDER_NAME = 'TripPlanner';



// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
    setupEventListeners();
    loadAllTrips();
    
    // Add radio buttons for search if they don't exist
    if (!document.getElementById('search-only')) {
        addSearchOptions();
    }
    
    // Init Google API if credentials are provided
    // Change this inside your DOMContentLoaded event listener
    if (CLIENT_ID && CLIENT_ID !== 'YOUR_CLIENT_ID') {
        initGoogleApi();
    } else {
        // Show setup instructions for Google Drive
        document.getElementById('google-login').innerText = 'Setup Google Drive';
        document.getElementById('google-login').addEventListener('click', showGoogleSetupInstructions);
    }
});

function addSearchOptions() {
    const searchContainer = document.querySelector('.search-container');
    
    // Add location button if it doesn't exist
    if (!document.getElementById('center-location-button')) {
        const locationButton = document.createElement('button');
        locationButton.id = 'center-location-button';
        locationButton.title = 'Center on my location';
        locationButton.innerHTML = '<i class="fas fa-location-arrow"></i>';
        locationButton.addEventListener('click', centerOnMyLocation);
        searchContainer.appendChild(locationButton);
    }
    
    // Create search options container
    const searchOptions = document.createElement('div');
    searchOptions.className = 'search-options';
    searchOptions.innerHTML = `
        <label>
            <input type="radio" name="search-option" id="search-only" checked>
            Search only
        </label>
        <label>
            <input type="radio" name="search-option" id="search-add">
            Search and add
        </label>
    `;
    
    // Insert after search container
    searchContainer.parentNode.insertBefore(searchOptions, searchContainer.nextSibling);
}

// Initialize the Leaflet map
function initializeMap() {
    // Create a map centered on a default location (adjust as needed)
    map = L.map('map', {
        contextmenu: true,
        contextmenuWidth: 180,
        contextmenuItems: [{
            text: 'Add Destination Here',
            callback: function(e) {
                currentMarkerPosition = e.latlng;
                showAddLocationModal();
            }
        }]
    }).setView([40.7128, -74.0060], 13);
    
    // Add the OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);
    
    // Setup right-click (contextmenu) handler to add new destinations
    map.on('contextmenu', (e) => {
        currentMarkerPosition = e.latlng;
        showAddLocationModal();
        // Prevent the default browser context menu
        e.originalEvent.preventDefault();
    });
}

// Set up event listeners for various UI elements
function setupEventListeners() {
    // Search functionality
    document.getElementById('search-button').addEventListener('click', performSearch);
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
    
    // Center on my location
    if (document.getElementById('center-location-button')) {
        document.getElementById('center-location-button').addEventListener('click', centerOnMyLocation);
    }
    
    // Trip management
    document.getElementById('new-trip-button').addEventListener('click', createNewTrip);
    document.getElementById('delete-trip-button').addEventListener('click', deleteCurrentTrip);
    document.getElementById('trip-select').addEventListener('change', switchTrip);
    
    // Trip details form
    document.getElementById('trip-name').addEventListener('change', (e) => {
        tripData.name = e.target.value;
        updateTripSelectOptions();
        saveTripData();
    });
    
    document.getElementById('start-date').addEventListener('change', (e) => {
        tripData.startDate = e.target.value;
        saveTripData();
    });
    
    document.getElementById('end-date').addEventListener('change', (e) => {
        tripData.endDate = e.target.value;
        saveTripData();
    });
    
    // Control buttons
    document.getElementById('clear-route').addEventListener('click', clearRoute);
    document.getElementById('export-trip').addEventListener('click', exportTrip);
    
    // Google Drive integration
    document.getElementById('google-login').addEventListener('click', handleGoogleAuth);
    document.getElementById('save-to-drive').addEventListener('click', saveAllTripsToDrive);
    document.getElementById('load-from-drive').addEventListener('click', loadTripsFromDrive);
    
    // Modal functionality
    document.querySelector('.close').addEventListener('click', function() {
        hideAddLocationModal();
    });
    
    document.getElementById('save-location').addEventListener('click', function() {
        saveNewLocation();
    });
    
    // Add keyboard support for the modal (Escape to close, Enter to save)
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            hideAddLocationModal();
        } else if (e.key === 'Enter' && document.getElementById('add-location-modal').style.display === 'block') {
            // Check if we're in a text area before saving (avoid saving when pressing Enter in notes)
            if (document.activeElement.tagName !== 'TEXTAREA') {
                saveNewLocation();
            }
        }
    });
}

// Search for locations using the Nominatim API
function performSearch() {
    const searchInput = document.getElementById('search-input').value;
    
    if (searchInput.trim() === '') {
        alert('Please enter a location to search');
        return;
    }
    
    // Show a loading indicator in the search input
    const searchButton = document.getElementById('search-button');
    const originalButtonHTML = searchButton.innerHTML;
    searchButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    searchButton.disabled = true;
    
    // Use Nominatim for geocoding with proper headers and delay to respect usage policy
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchInput)}&limit=1`, {
        headers: {
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': 'TripPlanner/1.0'
        }
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Reset the search button
            searchButton.innerHTML = originalButtonHTML;
            searchButton.disabled = false;
            
            if (data.length > 0) {
                // Take the first result
                const result = data[0];
                const latlng = L.latLng(result.lat, result.lon);
                
                // Pan to the location
                map.setView(latlng, 13);
                
                // Only show the modal to add a destination if the "Search and add" option is selected
                if (document.getElementById('search-add') && document.getElementById('search-add').checked) {
                    // Set current marker position and show modal to add details
                    currentMarkerPosition = latlng;
                    document.getElementById('location-name').value = result.display_name.split(',')[0];
                    showAddLocationModal();
                }
            } else {
                alert('No locations found with that name. Try a different search term.');
            }
        })
        .catch(error => {
            // Reset the search button
            searchButton.innerHTML = originalButtonHTML;
            searchButton.disabled = false;
            
            console.error('Error searching for location:', error);
            alert('Error searching for location. This could be due to connectivity issues or rate limiting. Please try again in a moment.');
        });
}

// Center map on user's location
function centerOnMyLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
                map.setView(latlng, 13);
            },
            (error) => {
                console.error('Error getting location:', error);
                alert('Unable to get your current location. Please check your browser permissions.');
            }
        );
    } else {
        alert('Geolocation is not supported by your browser');
    }
}

// Show the modal for adding a new location
function showAddLocationModal() {
    const modal = document.getElementById('add-location-modal');
    modal.style.display = 'block';
    
    // Set default date based on previous waypoint or trip start date
    if (tripData.destinations.length > 0) {
        // Get all destinations with dates
        const datedDestinations = tripData.destinations.filter(d => d.date);
        
        if (datedDestinations.length > 0) {
            // Sort by date
            datedDestinations.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            // Get the latest date
            const latestDestination = datedDestinations[datedDestinations.length - 1];
            const latestDate = new Date(latestDestination.date);
            
            // Add one day
            latestDate.setDate(latestDate.getDate() + 1);
            
            // Format date as YYYY-MM-DD for the input field
            const nextDay = latestDate.toISOString().split('T')[0];
            document.getElementById('location-date').value = nextDay;
        } else if (tripData.startDate) {
            // If no destinations have dates but trip has start date, use that
            const startDate = new Date(tripData.startDate);
            startDate.setDate(startDate.getDate() + tripData.destinations.length);
            document.getElementById('location-date').value = startDate.toISOString().split('T')[0];
        } else {
            // Default to today
            document.getElementById('location-date').value = new Date().toISOString().split('T')[0];
        }
    } else if (tripData.startDate) {
        // If first destination and trip has start date
        document.getElementById('location-date').value = tripData.startDate;
    } else {
        // Default to today
        document.getElementById('location-date').value = new Date().toISOString().split('T')[0];
    }
}

// Hide the add location modal
function hideAddLocationModal() {
    const modal = document.getElementById('add-location-modal');
    modal.style.display = 'none';
    
    // Clear form fields
    document.getElementById('location-name').value = '';
    document.getElementById('location-date').value = '';
    document.getElementById('location-notes').value = '';
}

// Save a new location
function saveNewLocation() {
    const name = document.getElementById('location-name').value;
    const date = document.getElementById('location-date').value;
    const notes = document.getElementById('location-notes').value;
    
    if (!name || !currentMarkerPosition) {
        alert('Please provide a name for this location');
        return;
    }
    
    // Create new destination object
    const newDestination = {
        id: Date.now(), // Use timestamp as unique ID
        name: name,
        date: date,
        notes: notes,
        lat: currentMarkerPosition.lat,
        lng: currentMarkerPosition.lng
    };
    
    // Add to our trip data
    tripData.destinations.push(newDestination);
    
    // Add marker to the map
    addMarkerToMap(newDestination);
    
    // Update the sidebar list
    updateDestinationsList();
    
    // Save to local storage
    saveTripData();
    
    // Update the route
    updateRoute();
    
    // Hide the modal
    hideAddLocationModal();
}

// Add a marker to the map for a destination
function addMarkerToMap(destination) {
    const markerNumber = tripData.destinations.length;
    
    // Create custom icon with number
    const customIcon = L.divIcon({
        className: 'custom-marker-label',
        html: markerNumber,
        iconSize: [30, 30]
    });
    
    // Create and add the marker
    const marker = L.marker([destination.lat, destination.lng], { icon: customIcon })
        .addTo(map)
        .bindPopup(`
            <strong>${destination.name}</strong><br>
            ${destination.date ? `Date: ${destination.date}<br>` : ''}
            ${destination.notes ? `Notes: ${destination.notes}` : ''}
        `);
    
    // Store reference to the marker
    markers.push({
        id: destination.id,
        marker: marker
    });
}

function updateDestinationsList() {
    const listElement = document.getElementById('destinations-list');
    listElement.innerHTML = '';
    
    // Sort destinations by date if available
    const sortedDestinations = [...tripData.destinations];
    sortedDestinations.sort((a, b) => {
        if (a.date && b.date) {
            return new Date(a.date) - new Date(b.date);
        }
        return 0;
    });
    
    // Create list items
    sortedDestinations.forEach((destination, index) => {
        const listItem = document.createElement('li');
        listItem.className = 'destination-item';
        listItem.innerHTML = `
            <div class="destination-number">${index + 1}</div>
            <div class="destination-info">
                <div class="destination-name">${destination.name}</div>
                ${destination.date ? `<div class="destination-date">${destination.date}</div>` : ''}
            </div>
            <div class="destination-actions">
                <button class="move-up-destination" data-id="${destination.id}" ${index === 0 ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
                <button class="move-down-destination" data-id="${destination.id}" ${index === sortedDestinations.length - 1 ? 'disabled' : ''}><i class="fas fa-arrow-down"></i></button>
                <button class="edit-destination" data-id="${destination.id}"><i class="fas fa-edit"></i></button>
                <button class="delete-destination" data-id="${destination.id}"><i class="fas fa-trash"></i></button>
            </div>
        `;
        listElement.appendChild(listItem);
    });
    
    // Add event listeners to the new buttons
    document.querySelectorAll('.delete-destination').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = parseInt(e.currentTarget.getAttribute('data-id'));
            deleteDestination(id);
        });
    });
    
    document.querySelectorAll('.edit-destination').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = parseInt(e.currentTarget.getAttribute('data-id'));
            editDestination(id);
        });
    });
    
    // Add event listeners for reordering
    document.querySelectorAll('.move-up-destination').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = parseInt(e.currentTarget.getAttribute('data-id'));
            moveDestinationUp(id);
        });
    });
    
    document.querySelectorAll('.move-down-destination').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = parseInt(e.currentTarget.getAttribute('data-id'));
            moveDestinationDown(id);
        });
    });
}

// Delete a destination
function deleteDestination(id) {
    if (confirm('Are you sure you want to delete this destination?')) {
        // Remove from trip data
        tripData.destinations = tripData.destinations.filter(d => d.id !== id);
        
        // Remove marker from map
        const markerIndex = markers.findIndex(m => m.id === id);
        if (markerIndex !== -1) {
            map.removeLayer(markers[markerIndex].marker);
            markers.splice(markerIndex, 1);
        }
        
        // Update the UI
        updateDestinationsList();
        updateRoute();
        saveTripData();
    }
}

// Edit a destination (placeholder function - to be implemented)
function editDestination(id) {
    // Find the destination
    const destination = tripData.destinations.find(d => d.id === id);
    if (!destination) return;
    
    // For now, just show an alert (you can expand this to open a modal with form pre-filled)
    alert(`Edit functionality for "${destination.name}" will be implemented in the next phase.`);
}

// Move a destination up in the list (earlier in the trip)
function moveDestinationUp(id) {
    // Find the destination index
    const index = tripData.destinations.findIndex(d => d.id === id);
    if (index <= 0) return; // Already at the top
    
    // Get the dates
    const currentDate = new Date(tripData.destinations[index].date);
    const prevDate = new Date(tripData.destinations[index-1].date);
    
    // Swap the dates
    tripData.destinations[index].date = prevDate.toISOString().split('T')[0];
    tripData.destinations[index-1].date = currentDate.toISOString().split('T')[0];
    
    // Update the UI
    updateDestinationsList();
    updateRoute();
    saveTripData();
}

// Move a destination down in the list (later in the trip)
function moveDestinationDown(id) {
    // Find the destination index
    const index = tripData.destinations.findIndex(d => d.id === id);
    if (index < 0 || index >= tripData.destinations.length - 1) return; // Already at the bottom
    
    // Get the dates
    const currentDate = new Date(tripData.destinations[index].date);
    const nextDate = new Date(tripData.destinations[index+1].date);
    
    // Swap the dates
    tripData.destinations[index].date = nextDate.toISOString().split('T')[0];
    tripData.destinations[index+1].date = currentDate.toISOString().split('T')[0];
    
    // Update the UI
    updateDestinationsList();
    updateRoute();
    saveTripData();
}

// Update the route between destinations with improved directions panel
function updateRoute() {
    // Remove existing route if any
    if (routingControl) {
        map.removeControl(routingControl);
    }
    
    // Need at least 2 points for a route
    if (tripData.destinations.length < 2) {
        return;
    }
    
    // Get waypoints (sorted by date if available)
    const sortedDestinations = [...tripData.destinations];
    sortedDestinations.sort((a, b) => {
        if (a.date && b.date) {
            return new Date(a.date) - new Date(b.date);
        }
        return 0;
    });
    
    const waypoints = sortedDestinations.map(d => L.latLng(d.lat, d.lng));
    
    // Create a new route with draggable disabled to prevent adding waypoints by clicking the route
    routingControl = L.Routing.control({
        waypoints: waypoints,
        routeWhileDragging: false,
        showAlternatives: true,
        fitSelectedRoutes: true,
        lineOptions: {
            styles: [
                { color: '#3498db', opacity: 0.8, weight: 6 },
                { color: 'white', opacity: 0.3, weight: 4 }
            ]
        },
        // Disable waypoint dragging and clicking to prevent adding new waypoints
        createMarker: function() { return null; }, // Hide default waypoint markers as we're using our own
        addWaypoints: false, // Prevent adding new waypoints by clicking on the route
        show: false // Hide directions panel by default
    }).addTo(map);
    
    // Add a button to toggle directions
    addDirectionsToggleButton();
    
    // Style the routing container to be more readable
    styleRoutingContainer();
}

// Add a toggle button for directions
function addDirectionsToggleButton() {
    // Don't add button if it already exists
    if (document.getElementById('toggle-directions-button')) {
        return;
    }
    
    // Create a button to toggle directions
    const toggleButton = L.control({position: 'topright'});
    
    toggleButton.onAdd = function(map) {
        const div = L.DomUtil.create('div', 'toggle-directions-control');
        div.innerHTML = `<button id="toggle-directions-button" class="leaflet-bar leaflet-control" title="Toggle Directions"><i class="fas fa-directions"></i></button>`;
        return div;
    };
    
    toggleButton.addTo(map);
    
    // Add click event to the button
    document.getElementById('toggle-directions-button').addEventListener('click', function() {
        const routingContainer = document.querySelector('.leaflet-routing-container');
        if (routingContainer) {
            if (routingContainer.style.display === 'none') {
                routingContainer.style.display = 'block';
                this.classList.add('active');
            } else {
                routingContainer.style.display = 'none';
                this.classList.remove('active');
            }
        }
    });
}

// Style the routing container to be more readable
function styleRoutingContainer() {
    // Add a small delay to ensure routing container is loaded
    setTimeout(() => {
        const routingContainer = document.querySelector('.leaflet-routing-container');
        if (routingContainer) {
            // Set initial display to none
            routingContainer.style.display = 'none';
            
            // Improve container style
            routingContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
            routingContainer.style.padding = '10px';
            routingContainer.style.borderRadius = '4px';
            routingContainer.style.maxHeight = '50vh';
            routingContainer.style.overflowY = 'auto';
            routingContainer.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.2)';
            
            // Add title
            const title = document.createElement('h3');
            title.textContent = 'Directions';
            title.style.marginTop = '0';
            title.style.marginBottom = '10px';
            title.style.fontSize = '16px';
            
            // Insert title at the beginning
            if (routingContainer.firstChild) {
                routingContainer.insertBefore(title, routingContainer.firstChild);
            }
        }
    }, 500);
}

// Add click handler for markers to show directions to that point
function addMarkerToMap(destination) {
    const markerNumber = tripData.destinations.length;
    
    // Create custom icon with number
    const customIcon = L.divIcon({
        className: 'custom-marker-label',
        html: markerNumber,
        iconSize: [30, 30]
    });
    
    // Create and add the marker
    const marker = L.marker([destination.lat, destination.lng], { icon: customIcon })
        .addTo(map)
        .bindPopup(`
            <strong>${destination.name}</strong><br>
            ${destination.date ? `Date: ${destination.date}<br>` : ''}
            ${destination.notes ? `Notes: ${destination.notes}` : ''}
        `);
    
    // Add click handler to show directions to this point when clicked
    marker.on('click', function() {
        if (tripData.destinations.length > 1) {
            // Find the index of this destination
            const destinationIndex = tripData.destinations.findIndex(d => d.id === destination.id);
            
            // If this is not the first destination, show directions from previous to this one
            if (destinationIndex > 0) {
                // Show the routing container
                const routingContainer = document.querySelector('.leaflet-routing-container');
                if (routingContainer) {
                    routingContainer.style.display = 'block';
                    
                    // Make the toggle button active
                    const toggleButton = document.getElementById('toggle-directions-button');
                    if (toggleButton) {
                        toggleButton.classList.add('active');
                    }
                }
            }
        }
    });
    
    // Store reference to the marker
    markers.push({
        id: destination.id,
        marker: marker
    });
}

// Clear the current route
function clearRoute() {
    if (confirm('Are you sure you want to clear the entire route?')) {
        // Remove all markers
        markers.forEach(m => map.removeLayer(m.marker));
        markers = [];
        
        // Remove route
        if (routingControl) {
            map.removeControl(routingControl);
            routingControl = null;
        }
        
        // Clear trip data
        tripData.destinations = [];
        updateDestinationsList();
        saveTripData();
    }
}

// Export trip data to JSON file
function exportTrip() {
    if (tripData.destinations.length === 0) {
        alert('No destinations to export. Add some places to your trip first!');
        return;
    }
    
    const dataStr = JSON.stringify(tripData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `${tripData.name || 'trip'}_plan.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}

// Trip management functions
function createNewTrip() {
    // Create a new trip with a unique ID
    const newTrip = {
        id: Date.now(),
        name: 'New Trip ' + new Date().toLocaleDateString(),
        startDate: null,
        endDate: null,
        destinations: []
    };
    
    // Add to the list of all trips
    allTrips.push(newTrip);
    
    // Set as current trip
    tripData = newTrip;
    currentTripId = newTrip.id;
    
    // Clear the map
    clearMapOnly();
    
    // Update UI
    document.getElementById('trip-name').value = newTrip.name;
    document.getElementById('start-date').value = '';
    document.getElementById('end-date').value = '';
    updateDestinationsList();
    
    // Update trip select dropdown
    updateTripSelectOptions();
    
    // Save to local storage
    saveAllTrips();
    
    // Flash the trip name field to draw attention to it
    const tripNameField = document.getElementById('trip-name');
    tripNameField.focus();
    tripNameField.select();
    
    // Show a helpful message
    alert('New trip created! You can now rename it and add destinations.');
}

function deleteCurrentTrip() {
    if (!currentTripId || allTrips.length <= 1) {
        alert('Cannot delete the only trip. Create a new trip first.');
        return;
    }
    
    if (confirm('Are you sure you want to delete this trip?')) {
        // Remove the current trip from the list
        allTrips = allTrips.filter(trip => trip.id !== currentTripId);
        
        // Select another trip
        tripData = allTrips[0];
        currentTripId = tripData.id;
        
        // Clear and load the new current trip
        clearMapOnly();
        loadTripData(tripData);
        
        // Update trip select dropdown
        updateTripSelectOptions();
        
        // Save to local storage
        saveAllTrips();
    }
}

function switchTrip(event) {
    const selectedTripId = parseInt(event.target.value);
    const selectedTrip = allTrips.find(trip => trip.id === selectedTripId);
    
    if (selectedTrip) {
        // Set as current trip
        tripData = selectedTrip;
        currentTripId = selectedTrip.id;
        
        // Clear the map
        clearMapOnly();
        
        // Load the selected trip
        loadTripData(selectedTrip);
        
        // Save to local storage
        saveAllTrips();
    }
}

function updateTripSelectOptions() {
    const selectElement = document.getElementById('trip-select');
    selectElement.innerHTML = '';
    
    allTrips.forEach(trip => {
        const option = document.createElement('option');
        option.value = trip.id;
        option.textContent = trip.name || `Trip ${trip.id}`;
        option.selected = trip.id === currentTripId;
        selectElement.appendChild(option);
    });
}

// Clear only the map without affecting trip data
function clearMapOnly() {
    // Remove all markers
    markers.forEach(m => map.removeLayer(m.marker));
    markers = [];
    
    // Remove route
    if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
    }
}

// Save all trips to local storage
function saveAllTrips() {
    // Update the current trip in the allTrips array
    const index = allTrips.findIndex(trip => trip.id === currentTripId);
    if (index !== -1) {
        allTrips[index] = tripData;
    }
    
    localStorage.setItem('tripPlannerAllTrips', JSON.stringify(allTrips));
}

// Save current trip data
function saveTripData() {
    // Update the trip in the allTrips array
    const index = allTrips.findIndex(trip => trip.id === currentTripId);
    if (index !== -1) {
        allTrips[index] = tripData;
    }
    
    saveAllTrips();
}

// Load all trips from local storage
function loadAllTrips() {
    const savedTrips = localStorage.getItem('tripPlannerAllTrips');
    if (savedTrips) {
        try {
            allTrips = JSON.parse(savedTrips);
            
            // If there are no trips, create a default one
            if (allTrips.length === 0) {
                createNewTrip();
                return;
            }
            
            // Set the first trip as current if none is set
            tripData = allTrips[0];
            currentTripId = tripData.id;
            
            // Update UI
            updateTripSelectOptions();
            loadTripData(tripData);
            
        } catch (error) {
            console.error('Error loading saved trips:', error);
            // Create a default trip if there was an error
            createNewTrip();
        }
    } else {
        // No saved trips, create a default one
        createNewTrip();
    }
}

// Load trip data into the UI
function loadTripData(trip) {
    if (!trip) return;
    
    // Update UI with loaded data
    document.getElementById('trip-name').value = trip.name || '';
    document.getElementById('start-date').value = trip.startDate || '';
    document.getElementById('end-date').value = trip.endDate || '';
    
    // Add markers for each destination
    trip.destinations.forEach(destination => {
        addMarkerToMap(destination);
    });
    
    // Update the destinations list
    updateDestinationsList();
    
    // Update the route
    updateRoute();
    
    // If there are destinations, fit the map to show all of them
    if (trip.destinations.length > 0) {
        const bounds = L.latLngBounds(trip.destinations.map(d => [d.lat, d.lng]));
        map.fitBounds(bounds);
    }
}