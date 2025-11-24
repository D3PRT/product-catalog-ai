# AI Product Catalog Assistant

An intelligent web application that helps you manage and analyze product catalogs using Claude AI. Upload your product data as CSV files and interact with an AI assistant to query, analyze, and manage your inventory.

## Features

- **CSV Upload & Parsing**: Upload product and bundle data from CSV files
- **Natural Language Queries**: Ask questions about your catalog in plain English
- **Data Analysis**: Get instant statistics, find products, and discover insights
- **Product Management**: Receive assistance with adding new products or organizing existing ones
- **Secure & Private**: Your API key is stored locally in your browser
- **No Backend Required**: Runs entirely in the browser with direct API integration

## Demo

Try asking questions like:
- "How many products do we have?"
- "Show me the most expensive items"
- "What categories are available?"
- "Help me add a new product"
- "Find products under $50"

## Getting Started

### Prerequisites

You'll need an Anthropic API key to use this application. Get one at [console.anthropic.com](https://console.anthropic.com/)

### Installation

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd product-catalog-ai
   ```

2. Open `index.html` in your web browser

That's it! No build process or dependencies to install.

### Usage

1. **Enter your API key**: On first load, you'll be prompted to enter your Anthropic API key. This is stored locally in your browser and never sent anywhere except directly to Anthropic's API.

2. **Upload CSV files**: Upload your product catalog CSV file. Optionally, upload a bundles CSV if you have product bundles.

3. **Start asking questions**: Use the chat interface to ask questions about your catalog, request analysis, or get help managing your products.

## CSV Format

Your CSV files should include headers. The app automatically detects columns and makes them available to the AI assistant.

Example product CSV structure:
```csv
id,name,category,price,stock,description
1,Widget A,Electronics,29.99,100,A useful widget
2,Gadget B,Tools,49.99,50,An essential gadget
```

## Deployment

### Netlify

This project is configured for easy deployment on Netlify:

1. Push your code to GitHub
2. Connect your repository to Netlify
3. Deploy (no build configuration needed)

The `netlify.toml` file is already configured for deployment.

### Other Static Hosts

Since this is a static HTML file, you can deploy it to any static hosting service:
- GitHub Pages
- Vercel
- AWS S3 + CloudFront
- Any web server

## Technical Details

- **Frontend**: Pure HTML/JavaScript with React 18 (via CDN)
- **Styling**: Tailwind CSS (via CDN)
- **CSV Parsing**: PapaParse library
- **AI Model**: Claude Sonnet 4 (claude-sonnet-4-20250514)
- **API**: Direct integration with Anthropic Messages API

## Configuration

### Changing the AI Model

Edit the model name in `index.html` at line 150:
```javascript
model: "claude-sonnet-4-20250514"
```

### Adjusting Data Limits

For large catalogs (>100 items), the app sends a subset of data to avoid token limits. Adjust these thresholds at:
- Line 117: Products limit check
- Line 130: Bundles limit check

## Privacy & Security

- Your API key is stored in browser localStorage
- CSV data is processed entirely in your browser
- No data is sent to any server except Anthropic's API for processing
- All communication with Anthropic uses HTTPS

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[Add your license here]

## Support

For issues or questions, please open an issue on GitHub.
