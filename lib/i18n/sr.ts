// Serbian (Latin) translations
export const sr = {
	auth: {
		welcomeBack: "Dobrodošao, gweilo.",
		signInSubtitle: "Prijavi se da pratiš mečeve i statistiku",
		createAccount: "Registruj se",
		createAccountSubtitle: "Pridružite se da počnete da pratite mečeve",
		resetPassword: "Resetuj lozinku",
		resetPasswordSubtitle:
			"Unesi email da primiš link za resetovanje lozinke",
		emailAddress: "Email adresa",
		password: "Lozinka",
		forgot: "Zaboravio?",
		signIn: "Prijavi se",
		sendResetLink: "Pošalji link za resetovanje",
		backToSignIn: "← Nazad na prijavu",
		orContinueWith: "Ili nastavi sa",
		dontHaveAccount: "Nemaš nalog?",
		alreadyHaveAccount: "Već imaš nalog?",
		fullName: "Ime i prezime",
		error: {
			invalidCredentials: "Neispravni email ili lozinka",
			emailAlreadyExists: "Email već postoji",
			weakPassword: "Lozinka mora imati najmanje 6 karaktera",
			invalidEmail: "Neispravna email adresa",
			generic: "Došlo je do greške. Pokušaj ponovo.",
			oauthError: "Greška pri prijavljivanju sa Google-om",
		},
		success: {
			registrationSuccess: "Registracija je uspešna.",
			emailConfirmationSent: "Poslali smo ti email za potvrdu naloga.",
			checkInbox: "Molimo te da proveriš inbox.",
		},
	},
	common: {
		dashboard: "Kontrolna tabla",
		logout: "Odjavi se",
		welcome: "Dobrodošao",
	},
	user: {
		account: "Nalog",
		notifications: "Notifikacije",
		logout: "Izloguj se",
	},
	pages: {
		dashboard: "Pregled",
		settings: "Podešavanja",
		rules: "Pravila igre",
		polls: "Anketarijum",
		notifications: "Notifikacije",
	},
	meta: {
		title: "Gweilo :: Les talkie-talkie, more ping-pong.",
		description: "Sistem Elo rejtinga za stoni tenis",
	},
	logo: {
		alt: "GWEILO NS",
	},
} as const;
