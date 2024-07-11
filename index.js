const express = require('express');
const bodyParser = require('body-parser');
const { RecaptchaEnterpriseServiceClient } = require('@google-cloud/recaptcha-enterprise');
const admin = require('firebase-admin');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Set the path to the service account key files
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, 'google-cloud-sdk.json');
const firebaseServiceAccountKeyPath = path.join(__dirname, 'serviceAccountKey.json');

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.cert(firebaseServiceAccountKeyPath),
    databaseURL: "https://form-2b721-default-rtdb.firebaseio.com"
});
const db = admin.firestore();

// Google Cloud Project ID and reCAPTCHA key
const projectID = "formapp-1720181549488";
const recaptchaKey = "6LcOcQgqAAAAAEDLJ_AWQ7zBRYt_DokVn_SzBbq0";

// Create a reCAPTCHA Enterprise client
const recaptchaClient = new RecaptchaEnterpriseServiceClient();

// Function to verify reCAPTCHA token
async function verifyRecaptcha(token, recaptchaAction) {
    const projectPath = recaptchaClient.projectPath(projectID);
    const request = {
        assessment: {
            event: {
                token: token,
                siteKey: recaptchaKey,
            },
        },
        parent: projectPath,
    };

    try {
        const [response] = await recaptchaClient.createAssessment(request);

        if (!response.tokenProperties.valid) {
            console.log(`The CreateAssessment call failed because the token was: ${response.tokenProperties.invalidReason}`);
            return false;
        }

        if (response.tokenProperties.action === recaptchaAction) {
            console.log(`The reCAPTCHA score is: ${response.riskAnalysis.score}`);
            return response.riskAnalysis.score >= 0.5;
        } else {
            console.log("The action attribute in your reCAPTCHA tag does not match the action you are expecting to score");
            return false;
        }
    } catch (error) {
        console.error('Error verifying reCAPTCHA:', error);
        return false;
    }
}

// Route to handle form submission
app.post('/', async (req, res) => {
    const { token, username, email, code, phone1 } = req.body;
    // Ensure these variables match exactly with the JSON structure sent from the frontend
    console.log('Received token:', token);
    console.log('Received username:', username);
    console.log('Received email:', email);
    console.log('Received phone:', code);
    console.log('Received phone1:', phone1);

    const recaptchaAction = "submit"; // Adjust based on your reCAPTCHA action
    // Verify reCAPTCHA
    const isValidRecaptcha = await verifyRecaptcha(token, recaptchaAction);

    if (isValidRecaptcha) {
        // Save data to Firestore
        try {
            const docRef = await db.collection('data').add({
                username: username,
                email: email,
                code: code,
                phone1: phone1,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log('Document ID:', docRef.id);
            res.status(200).json({ message: 'Data successfully submitted!', documentId: docRef.id });
        } catch (error) {
            console.error('Error saving data to Firestore:', error);
            res.status(500).json({ error: 'Failed to submit data. Please try again.' });
        }
    } else {
        res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
