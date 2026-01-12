<?php
/**
 * P1 Monitor Custom UI - Main Entry Point
 */

require_once 'config.php';

// Get the requested page from URL parameter, default to dashboard
$page = isset($_GET['page']) ? $_GET['page'] : 'dashboard';

// Sanitize page name (allow only alphanumeric and underscore)
$page = preg_replace('/[^a-z0-9_]/', '', strtolower($page));

// List of valid pages
$validPages = ['dashboard', 'electricity', 'gas', 'water', 'solar', 'costs'];

// Check if page is valid
if (!in_array($page, $validPages)) {
    $page = 'dashboard';
}

// Get configuration
$config = P1Config::getUserPrefs();
$visibility = P1Config::getVisibility();
$maxValues = P1Config::getMaxValues();

// Prepare data to pass to the page
$pageData = [
    'currentPage' => $page,
    'config' => $config,
    'visibility' => $visibility,
    'maxValues' => $maxValues,
    'isFastMode' => P1Config::isFastMode()
];

// Render the page
echo renderPage($page, $pageData);
?>