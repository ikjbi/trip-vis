// Google Drive Integration Functions

// Show setup instructions for Google Drive
function showGoogleSetupInstructions() {
    alert(`To use Google Drive integration, you need to:

1. Go to the Google Cloud Console (console.cloud.google.com)
2. Create a new project
3. Enable the Google Drive API
4. Create OAuth credentials (Web application type)
5. Add your domain to the authorized JavaScript origins
6. Copy your API KEY and CLIENT ID
7. Update the constants in the app.js file

For detailed instructions, search for "Google Drive API JavaScript quickstart".`);
}

// Initialize the Google API client
function initGoogleApi() {
    gapi.load('client:auth2', initClient);
}

// Initialize the Google API client with your credentials
function initClient() {
    gapi.client.init({
        apiKey: API_KEY,
        clientId: CLIENT_ID,
        discoveryDocs: [DISCOVERY_DOC],
        scope: SCOPES
    }).then(() => {
        isGoogleApiInitialized = true;
        
        // Listen for sign-in state changes
        gapi.auth2.getAuthInstance().isSignedIn.listen(updateSignInStatus);
        
        // Handle the initial sign-in state
        updateSignInStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
    }).catch(error => {
        console.error('Error initializing Google API client:', error);
        document.getElementById('google-login').innerText = 'Google API Error';
    });
}

// Update the UI based on the current sign-in status
function updateSignInStatus(isSignedIn) {
    isUserSignedIn = isSignedIn;
    
    if (isSignedIn) {
        document.getElementById('google-login').innerText = 'Signed In to Google';
        document.getElementById('save-to-drive').disabled = false;
        document.getElementById('load-from-drive').disabled = false;
    } else {
        document.getElementById('google-login').innerText = 'Connect to Google Drive';
        document.getElementById('save-to-drive').disabled = true;
        document.getElementById('load-from-drive').disabled = true;
    }
}

// Handle the Google auth flow
function handleGoogleAuth() {
    if (!isGoogleApiInitialized) {
        showGoogleSetupInstructions();
        return;
    }
    
    if (isUserSignedIn) {
        // User is already signed in, confirm sign out
        if (confirm('You are currently signed in to Google Drive. Would you like to sign out?')) {
            gapi.auth2.getAuthInstance().signOut();
        }
    } else {
        // Sign in the user
        gapi.auth2.getAuthInstance().signIn()
            .catch(error => {
                console.error('Error signing in:', error);
                alert('Failed to sign in to Google Drive. Please try again.');
            });
    }
}

// Create or find the app folder in Google Drive
async function getAppFolder() {
    try {
        // Search for the app folder
        const response = await gapi.client.drive.files.list({
            q: `name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name)'
        });
        
        // If the folder exists, return its ID
        if (response.result.files.length > 0) {
            return response.result.files[0].id;
        }
        
        // If the folder doesn't exist, create it
        const folderResponse = await gapi.client.drive.files.create({
            resource: {
                name: APP_FOLDER_NAME,
                mimeType: 'application/vnd.google-apps.folder'
            },
            fields: 'id'
        });
        
        return folderResponse.result.id;
    } catch (error) {
        console.error('Error getting or creating app folder:', error);
        throw error;
    }
}

// Save all trips to Google Drive
async function saveAllTripsToDrive() {
    if (!isUserSignedIn) {
        alert('Please sign in to Google Drive first.');
        return;
    }
    
    try {
        const folderId = await getAppFolder();
        
        // Prepare the trip data file content
        const tripsData = JSON.stringify(allTrips);
        const fileName = 'trip_planner_data.json';
        
        // Check if the file already exists
        const fileResponse = await gapi.client.drive.files.list({
            q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name)'
        });
        
        if (fileResponse.result.files.length > 0) {
            // Update the existing file
            const fileId = fileResponse.result.files[0].id;
            
            // Use the appropriate method to update the file content
            const updateResponse = await gapi.client.request({
                path: `/upload/drive/v3/files/${fileId}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                body: tripsData
            });
            
            alert('Your trips have been updated in Google Drive!');
        } else {
            // Create a new file
            const metadata = {
                name: fileName,
                parents: [folderId],
                mimeType: 'application/json'
            };
            
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', new Blob([tripsData], { type: 'application/json' }));
            
            const createResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: new Headers({ 'Authorization': 'Bearer ' + gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token }),
                body: form
            });
            
            if (createResponse.ok) {
                alert('Your trips have been saved to Google Drive!');
            } else {
                throw new Error('Failed to create file in Google Drive');
            }
        }
    } catch (error) {
        console.error('Error saving trips to Google Drive:', error);
        alert('Error saving trips to Google Drive. Please try again.');
    }
}

// Load trips from Google Drive
async function loadTripsFromDrive() {
    if (!isUserSignedIn) {
        alert('Please sign in to Google Drive first.');
        return;
    }
    
    try {
        const folderId = await getAppFolder();
        
        // Look for the trip data file
        const fileName = 'trip_planner_data.json';
        const fileResponse = await gapi.client.drive.files.list({
            q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name)'
        });
        
        if (fileResponse.result.files.length === 0) {
            alert('No saved trips found in Google Drive.');
            return;
        }
        
        // Get the file content
        const fileId = fileResponse.result.files[0].id;
        const contentResponse = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });
        
        // Parse the data
        const driveTrips = JSON.parse(contentResponse.body);
        
        if (confirm('This will replace your current trips with those from Google Drive. Continue?')) {
            // Replace the current trips
            allTrips = driveTrips;
            
            // If there are no trips, create a default one
            if (allTrips.length === 0) {
                createNewTrip();
            } else {
                // Set the first trip as current
                tripData = allTrips[0];
                currentTripId = tripData.id;
                
                // Clear the map
                clearMapOnly();
                
                // Update UI
                updateTripSelectOptions();
                loadTripData(tripData);
                
                // Save to local storage
                saveAllTrips();
                
                alert('Trips loaded from Google Drive successfully!');
            }
        }
    } catch (error) {
        console.error('Error loading trips from Google Drive:', error);
        alert('Error loading trips from Google Drive. Please try again.');
    }
}