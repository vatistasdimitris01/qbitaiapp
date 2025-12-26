
export const translations = {
  en: {
    loader: { text: 'KIPP', subtext: 'Preparing environment...', },
    updateBanner: { text: 'A new version is available!', button: 'Refresh', },
    welcome: {
      skip: 'Skip Tutorial', next: 'Next', back: 'Back', getStarted: 'Begin Your Journey',
      steps: {
        intro: { title: 'The Soul of KIPP', story: 'KIPP (Kosmic Intelligence Pattern Perceptron) isn’t just another AI interface. It’s a space where aesthetics and intelligence converge.', sub: 'Intelligence, refined.', },
        workspace: { title: 'Your Digital Workspace', description: 'The interface is designed to disappear so your ideas can take center stage.', sidebar: 'History & Personalization', sidebar_desc: 'Access your past thoughts and customize the AI persona on the left.', input: 'Multimodal Input', input_desc: 'Drop files, record voice, or paste code. KIPP handles it all natively.', },
        features: { title: 'Pure Power, Native Execution', description: 'KIPP goes beyond text. It visualizes data and runs code directly in your browser.', examples: { stock: 'Analyze the markets', python: 'Execute complex math', web: 'Search the global web', } },
        location: { title: 'Grounded in Your World', description: 'To provide the most relevant answers KIPP can use your location.', allow: 'Allow Location Access', denied: 'Location access denied. You can change this in your browser settings.', }
      }
    },
    sidebar: { header: 'KIPP', newChat: 'New Chat', search: 'Search...', recent: 'Recent History', settings: 'Settings', close: 'Close sidebar', open: 'Open sidebar', remove: 'Remove chat', confirmDelete: 'Are you sure you want to delete this chat?', forkedChatTitle: 'Fork of "{oldTitle}"', history: 'History' },
    chat: {
      placeholder: 'Start a conversation with KIPP.', scrollToBottom: 'Scroll to bottom', replyContext: 'In reference to the following text:\n"""\n{context}\n"""',
      input: { placeholder: 'Ask KIPP anything...', disclaimer: 'KIPP can make mistakes. Check important info.', attach: 'Attach', submit: 'Submit', stop: 'Stop generation', },
      message: { thinking: 'Chain of Thought', grounding: 'Used Google Search and found the following sources:', copy: 'Copy message', regenerate: 'Regenerate response', viewCode: 'View Code', fork: 'Fork conversation', },
    },
    settings: {
      header: 'Settings', appearance: 'Appearance', behavior: 'Behavior', data: 'Data Controls', langTitle: 'Language / Γλώσσα',
      switches: { autoScroll: 'Enable Auto Scroll', docMode: 'Enable Document Mode', haptics: 'Haptic Feedback', wrapCode: 'Wrap Long Lines For Code', previews: 'Show Chat Previews', starry: 'Enable Starry Background' },
      buttons: { delete: 'Delete All Conversations', clear: 'Clear App Cache', deleteAction: 'Delete', clearAction: 'Clear' },
      themes: { light: 'Light', dark: 'Dark', system: 'System', },
    },
    dragDrop: { title: 'Add anything', subtitle: 'Drop any file here to add it to the conversation', },
    selectionPopup: { ask: 'Ask KIPP' }
  },
  el: {
    loader: { text: 'KIPP', subtext: 'Προετοιμασία περιβάλλοντος...', },
    updateBanner: { text: 'Μια νέα έκδοση είναι διαθέσιμη!', button: 'Ανανέωση', },
    welcome: {
      skip: 'Παράλειψη Οδηγού', next: 'Επόμενο', back: 'Πίσω', getStarted: 'Ξεκινήστε το Ταξίδι σας',
      steps: {
        intro: { title: 'Η Ψυχή του KIPP', story: 'Το KIPP δεν είναι απλώς μια διεπαφή AI. Είναι ένας χώρος όπου η αισθητική και η νοημοσύνη συγκλίνουν.', sub: 'Νοημοσύνη, εκλεπτυσμένη.', },
        workspace: { title: 'Ο Ψηφιακός σας Χώρος', description: 'Η διεπαφή έχει σχεδιαστεί για να εξαφανίζεται, ώστε οι ιδέες σας να βρίσκονται στο επίκεντρο.', sidebar: 'Ιστορικό & Εξατομίκευση', sidebar_desc: 'Πρόσβαση στις προηγούμενες σκέψεις σας και προσαρμογή του AI στα αριστερά.', input: 'Πολυτροπική Είσοδος', input_desc: 'Σύρετε αρχεία, ηχογραφήστε φωνή ή επικολλήστε κώδικα. Το KIPP τα χειρίζεται όλα.', },
        features: { title: 'Καθαρή Ισχύς, Τοπική Εκτέλεση', description: 'Το KIPP προχωρά πέρα από το κείμενο. Οπτικοποιεί δεδομένα και εκτελεί κώδικα στον περιηγητή σας.', examples: { stock: 'Ανάλυση αγορών', python: 'Εκτέλεση μαθηματικών', web: 'Αναζήτηση στον ιστό', } },
        location: { title: 'Γειωμένο στον Κόσμο σας', description: 'Για να παρέχει τις πιο σχετικές απαντήσεις, το KIPP μπορεί να χρησιμοποιήσει την τοποθεσία σας.', allow: 'Επιτρέψτε την Πρόσβαση', denied: 'Η πρόσβαση στην τοποθεσία απορρίφθηκε. Μπορείτε να το αλλάξετε στις ρυθμίσεις του περιηγητή σας.', }
      }
    },
    sidebar: { header: 'KIPP', newChat: 'Νέα Συνομιλία', search: 'Αναζήτηση...', recent: 'Πρόσφατο Ιστορικό', settings: 'Ρυθμίσεις', close: 'Κλείσιμο πλευρικού μενού', open: 'Άνοιγμα πλευρικού μενού', remove: 'Διαγραφή συνομιλίας', confirmDelete: 'Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή τη συνομιλία;', forkedChatTitle: 'Αντίγραφο του "{oldTitle}"', history: 'Ιστορικό' },
    chat: {
      placeholder: 'Ξεκινήστε μια συζήτηση με το KIPP.', scrollToBottom: 'Μετάβαση στο τέλος', replyContext: 'Σε αναφορά στο παρακάτω κείμενο:\n"""\n{context}\n"""',
      input: { placeholder: 'Ρωτήστε το KIPP οτιδήποτε...', disclaimer: 'Το KIPP μπορεί να κάνει λάθη. Ελέγξτε σημαντικές πληροφορίες.', attach: 'Επισύναψη', submit: 'Αποστολή', stop: 'Διακοπή παραγωγής', },
      message: { thinking: 'Αλυσίδα Σκέψης', grounding: 'Χρησιμοποιήθηκε η Αναζήτηση Google και βρέθηκαν οι εξής πηγές:', copy: 'Αντιγραφή μηνύματος', regenerate: 'Επαναπαραγωγή απάντησης', viewCode: 'Προβολή Κώδικα', fork: 'Δημιουργία αντιγράφου', },
    },
    settings: {
      header: 'Ρυθμίσεις', appearance: 'Εμφάνιση', behavior: 'Συμπεριφορά', data: 'Δεδομένα', langTitle: 'Γλώσσα / Language',
      switches: { autoScroll: 'Αυτόματη Κύλιση', docMode: 'Λειτουργία Εγγράφου', haptics: 'Απτική Ανάδραση', wrapCode: 'Αναδίπλωση Κώδικα', previews: 'Προεπισκόπηση Συνομιλιών', starry: 'Έναστρο Φόντο' },
      buttons: { delete: 'Διαγραφή Όλων των Συνομιλιών', clear: 'Εκκαθάριση Cache Εφαρμογής', deleteAction: 'Διαγραφή', clearAction: 'Εκκαθάριση' },
      themes: { light: 'Φωτεινό', dark: 'Σκοτεινό', system: 'Σύστημα', },
    },
    dragDrop: { title: 'Προσθέστε οτιδήποτε', subtitle: 'Σύρετε οποιοδήποτε αρχείο εδώ για να το προσθέσετε στη συνομιλία', },
    selectionPopup: { ask: 'Ρωτήστε το KIPP' }
  },
};
