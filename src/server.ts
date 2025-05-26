#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  Tool,
  Resource,
  CallToolResult,
  ReadResourceResult,
  TextContent,
} from '@modelcontextprotocol/sdk/types.js';
import https from 'https';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import * as tar from 'tar';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PackageInfo {
  name: string;
  version: string;
  dist: {
    tarball: string;
    shasum: string;
  };
  description?: string;
  main?: string;
  types?: string;
  keywords?: string[];
  author?: string | { name: string; email?: string };
  license?: string;
  homepage?: string;
  repository?: {
    type: string;
    url: string;
  };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface SearchResult {
  name: string;
  version: string;
  description?: string;
  keywords?: string[];
  author?: string | { name: string; email?: string };
  date: string;
  links: {
    npm: string;
    homepage?: string;
    repository?: string;
  };
  publisher: {
    username: string;
    email?: string;
  };
  maintainers: Array<{
    username: string;
    email?: string;
  }>;
  score: {
    final: number;
    detail: {
      quality: number;
      popularity: number;
      maintenance: number;
    };
  };
}

interface SearchResponse {
  objects: Array<{
    package: SearchResult;
    score: {
      final: number;
      detail: {
        quality: number;
        popularity: number;
        maintenance: number;
      };
    };
  }>;
  total: number;
  time: string;
}

interface CodeFile {
  path: string;
  content: string;
}

interface GetPackageCodeArgs {
  packageName: string;
  version?: string;
  filePath?: string;
}

interface ListPackageFilesArgs {
  packageName: string;
  version?: string;
}

interface SearchPackagesArgs {
  query: string;
  size?: number;
  from?: number;
}

class NpmPackageServer {
  private server: Server;
  private readonly codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.json'];
  private readonly tempDir: string;
  private popularPackagesCache: string | null = null;
  private popularPackagesCacheTime: number = 0;
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.tempDir = path.join(__dirname, 'temp');
    this.server = new Server(
      {
        name: 'npm-package-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.ensureTempDir();
  }

  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private setupResourceHandlers(): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources: Resource[] = [
        {
          uri: 'npm://popular-packages',
          name: 'Popular NPM Packages',
          description: 'List of the 50 most popular npm packages with details',
          mimeType: 'application/json',
        },
      ];

      return { resources };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      if (uri === 'npm://popular-packages') {
        return await this.getPopularPackages();
      }
      
      throw new McpError(ErrorCode.InvalidParams, `Unknown resource: ${uri}`);
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'get_npm_package_code',
          description: 'Fetch source code from an npm package',
          inputSchema: {
            type: 'object',
            properties: {
              packageName: {
                type: 'string',
                description: 'The name of the npm package (e.g., "lodash" or "@babel/core")',
              },
              version: {
                type: 'string',
                description: 'Specific version to fetch (optional, defaults to latest)',
              },
              filePath: {
                type: 'string',
                description: 'Specific file path within the package (optional, returns all files if not specified)',
              },
            },
            required: ['packageName'],
          },
        },
        {
          name: 'list_package_files',
          description: 'List all files in an npm package',
          inputSchema: {
            type: 'object',
            properties: {
              packageName: {
                type: 'string',
                description: 'The name of the npm package',
              },
              version: {
                type: 'string',
                description: 'Specific version to fetch (optional, defaults to latest)',
              },
            },
            required: ['packageName'],
          },
        },
        {
          name: 'get_package_info',
          description: 'Get package metadata and information',
          inputSchema: {
            type: 'object',
            properties: {
              packageName: {
                type: 'string',
                description: 'The name of the npm package',
              },
              version: {
                type: 'string',
                description: 'Specific version to fetch (optional, defaults to latest)',
              },
            },
            required: ['packageName'],
          },
        },
        {
          name: 'search_npm_packages',
          description: 'Search for npm packages by keyword, name, or description',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query (keywords, package name, description, etc.)',
              },
              size: {
                type: 'number',
                description: 'Number of results to return (default: 20, max: 250)',
                minimum: 1,
                maximum: 250,
              },
              from: {
                type: 'number',
                description: 'Starting offset for pagination (default: 0)',
                minimum: 0,
              },
            },
            required: ['query'],
          },
        },
      ];

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_npm_package_code':
            return await this.getNpmPackageCode(args as unknown as GetPackageCodeArgs);
          case 'list_package_files':
            return await this.listPackageFiles(args as unknown as ListPackageFilesArgs);
          case 'get_package_info':
            return await this.getPackageInfo(args as unknown as ListPackageFilesArgs);
          case 'search_npm_packages':
            return await this.searchNpmPackages(args as unknown as SearchPackagesArgs);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private async searchNpmPackages(args: SearchPackagesArgs): Promise<CallToolResult> {
    const { query, size = 20, from = 0 } = args;
    
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidParams, 'query is required and must be a non-empty string');
    }

    if (size > 250) {
      throw new McpError(ErrorCode.InvalidParams, 'size cannot exceed 250');
    }

    try {
      const searchResults = await this.performPackageSearch(query.trim(), size, from);
      
      let resultText = `Search Results for "${query}"\n`;
      resultText += `Total packages found: ${searchResults.total}\n`;
      resultText += `Showing ${searchResults.objects.length} results (from ${from})\n\n`;

      for (const result of searchResults.objects) {
        const pkg = result.package;
        const score = result.score;
        
        resultText += `📦 **${pkg.name}** v${pkg.version}\n`;
        resultText += `   ${pkg.description || 'No description available'}\n`;
        
        if (pkg.keywords && pkg.keywords.length > 0) {
          resultText += `   Keywords: ${pkg.keywords.join(', ')}\n`;
        }
        
        const authorName = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
        if (authorName) {
          resultText += `   Author: ${authorName}\n`;
        }
        
        resultText += `   Score: ${(score.final * 100).toFixed(1)}% (Quality: ${(score.detail.quality * 100).toFixed(1)}%, Popularity: ${(score.detail.popularity * 100).toFixed(1)}%, Maintenance: ${(score.detail.maintenance * 100).toFixed(1)}%)\n`;
        resultText += `   NPM: ${pkg.links.npm}\n`;
        
        if (pkg.links.homepage) {
          resultText += `   Homepage: ${pkg.links.homepage}\n`;
        }
        
        if (pkg.links.repository) {
          resultText += `   Repository: ${pkg.links.repository}\n`;
        }
        
        resultText += `   Last updated: ${new Date(pkg.date).toLocaleDateString()}\n\n`;
      }

      if (searchResults.objects.length === 0) {
        resultText += 'No packages found for this search query.\n';
        resultText += 'Try:\n';
        resultText += '- Using different keywords\n';
        resultText += '- Checking spelling\n';
        resultText += '- Using more general terms\n';
      }

      const content: TextContent = {
        type: 'text',
        text: resultText,
      };

      return { content: [content] };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to search packages: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async getPopularPackages(): Promise<ReadResourceResult> {
    // Check cache
    const now = Date.now();
    if (this.popularPackagesCache && (now - this.popularPackagesCacheTime) < this.CACHE_DURATION) {
      const content: TextContent = {
        type: 'text',
        text: this.popularPackagesCache,
      };
      return { contents: [content] };
    }

    try {
      // Fetch popular packages by searching with common terms and sorting by popularity
      const popularQueries = [
        'react', 'lodash', 'express', 'typescript', 'webpack', 
        'eslint', 'babel', 'prettier', 'jest', 'axios'
      ];
      
      const allPopularPackages = new Set<string>();
      const packageDetails: Array<SearchResult> = [];

      // Search for each popular term to get a diverse set of packages
      for (const searchTerm of popularQueries.slice(0, 5)) { // Limit to avoid rate limiting
        try {
          const results = await this.performPackageSearch(searchTerm, 10, 0);
          for (const result of results.objects) {
            if (!allPopularPackages.has(result.package.name)) {
              allPopularPackages.add(result.package.name);
              packageDetails.push(result.package);
            }
          }
        } catch (error) {
          console.error(`Failed to search for ${searchTerm}:`, error);
        }
      }

      // Sort by a combination of popularity and quality scores
      packageDetails.sort((a, b) => {
        // We don't have direct access to scores here, so sort by a heuristic
        const scoreA = (a.name.length < 15 ? 1 : 0) + (a.description ? 1 : 0) + (a.keywords?.length || 0) / 10;
        const scoreB = (b.name.length < 15 ? 1 : 0) + (b.description ? 1 : 0) + (b.keywords?.length || 0) / 10;
        return scoreB - scoreA;
      });

      let resultText = '# 🔥 Most Popular NPM Packages\n\n';
      resultText += `Updated: ${new Date().toISOString()}\n\n`;

      const topPackages = packageDetails.slice(0, 50);
      
      for (let i = 0; i < topPackages.length; i++) {
        const pkg = topPackages[i];
        resultText += `## ${i + 1}. ${pkg.name}\n`;
        resultText += `**Version:** ${pkg.version}\n`;
        resultText += `**Description:** ${pkg.description || 'No description available'}\n`;
        
        if (pkg.keywords && pkg.keywords.length > 0) {
          resultText += `**Keywords:** ${pkg.keywords.slice(0, 5).join(', ')}\n`;
        }
        
        const authorName = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
        if (authorName) {
          resultText += `**Author:** ${authorName}\n`;
        }
        
        resultText += `**NPM:** ${pkg.links.npm}\n`;
        
        if (pkg.links.homepage) {
          resultText += `**Homepage:** ${pkg.links.homepage}\n`;
        }
        
        if (pkg.links.repository) {
          resultText += `**Repository:** ${pkg.links.repository}\n`;
        }
        
        resultText += `**Last Updated:** ${new Date(pkg.date).toLocaleDateString()}\n\n`;
      }

      // Cache the result
      this.popularPackagesCache = resultText;
      this.popularPackagesCacheTime = now;

      const content: TextContent = {
        type: 'text',
        text: resultText,
      };

      return { contents: [content] };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch popular packages: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async performPackageSearch(query: string, size: number, from: number): Promise<SearchResponse> {
    return new Promise((resolve, reject) => {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://registry.npmjs.org/-/v1/search?text=${encodedQuery}&size=${size}&from=${from}&quality=0.65&popularity=0.98&maintenance=0.5`;
      
      const request = https.get(url, (res) => {
        let data = '';
        
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        
        res.on('end', () => {
          try {
            const searchResults = JSON.parse(data) as SearchResponse;
            resolve(searchResults);
          } catch (error) {
            reject(new Error(`Invalid JSON response: ${error instanceof Error ? error.message : String(error)}`));
          }
        });
      });

      request.on('error', (error) => {
        reject(new Error(`HTTP request failed: ${error.message}`));
      });

      request.setTimeout(15000, () => {
        request.destroy();
        reject(new Error('Search request timeout'));
      });
    });
  }

  private async getNpmPackageCode(args: GetPackageCodeArgs): Promise<CallToolResult> {
    const { packageName, version, filePath } = args;
    
    if (!packageName || typeof packageName !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'packageName is required and must be a string');
    }

    try {
      // Get package metadata to find tarball URL
      const packageInfo = await this.fetchPackageInfo(packageName, version);
      const tarballUrl = packageInfo.dist.tarball;
      
      // Download and extract the tarball
      const extractedPath = await this.downloadAndExtract(tarballUrl, packageName);
      
      if (filePath) {
        // Return specific file
        return await this.getSpecificFile(extractedPath, filePath);
      } else {
        // Return all code files
        return await this.getAllCodeFiles(extractedPath, packageInfo);
      }
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch package code: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async listPackageFiles(args: ListPackageFilesArgs): Promise<CallToolResult> {
    const { packageName, version } = args;
    
    if (!packageName || typeof packageName !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'packageName is required and must be a string');
    }

    try {
      const packageInfo = await this.fetchPackageInfo(packageName, version);
      const tarballUrl = packageInfo.dist.tarball;
      
      const extractedPath = await this.downloadAndExtract(tarballUrl, packageName);
      const allFiles = await this.getAllFiles(extractedPath);
      
      const fileList = allFiles
        .map(filePath => path.relative(extractedPath, filePath))
        .sort();
      
      const content: TextContent = {
        type: 'text',
        text: `Package: ${packageName}@${packageInfo.version}\nTotal files: ${fileList.length}\n\nFiles:\n${fileList.join('\n')}`,
      };

      return { content: [content] };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list package files: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async getPackageInfo(args: ListPackageFilesArgs): Promise<CallToolResult> {
    const { packageName, version } = args;
    
    if (!packageName || typeof packageName !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'packageName is required and must be a string');
    }

    try {
      const packageInfo = await this.fetchPackageInfo(packageName, version);
      
      const info = {
        name: packageInfo.name,
        version: packageInfo.version,
        description: packageInfo.description || 'No description available',
        main: packageInfo.main || 'Not specified',
        types: packageInfo.types || 'Not specified',
        keywords: packageInfo.keywords || [],
        author: packageInfo.author || 'Not specified',
        license: packageInfo.license || 'Not specified',
        homepage: packageInfo.homepage || 'Not specified',
        repository: packageInfo.repository?.url || 'Not specified',
        tarball: packageInfo.dist.tarball,
        shasum: packageInfo.dist.shasum,
        dependencies: Object.keys(packageInfo.dependencies || {}).length,
        devDependencies: Object.keys(packageInfo.devDependencies || {}).length,
      };

      const content: TextContent = {
        type: 'text',
        text: `Package Information:\n${JSON.stringify(info, null, 2)}`,
      };

      return { content: [content] };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get package info: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async getSpecificFile(extractedPath: string, filePath: string): Promise<CallToolResult> {
    const fullFilePath = path.join(extractedPath, filePath);
    
    if (!fs.existsSync(fullFilePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    const stats = fs.statSync(fullFilePath);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`);
    }

    try {
      const content = fs.readFileSync(fullFilePath, 'utf8');
      const textContent: TextContent = {
        type: 'text',
        text: `File: ${filePath}\n\n${content}`,
      };

      return { content: [textContent] };
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getAllCodeFiles(extractedPath: string, packageInfo: PackageInfo): Promise<CallToolResult> {
    const codeFiles = await this.findCodeFiles(extractedPath);
    
    let allContent = `Package: ${packageInfo.name}@${packageInfo.version}\n`;
    allContent += `Description: ${packageInfo.description || 'No description'}\n`;
    allContent += `Code files found: ${codeFiles.length}\n\n`;
    
    const maxFiles = 20; // Limit to prevent overwhelming responses
    const filesToShow = codeFiles.slice(0, maxFiles);
    
    for (const file of filesToShow) {
      const relativePath = path.relative(extractedPath, file.path);
      allContent += `=== ${relativePath} ===\n`;
      allContent += file.content + '\n\n';
    }
    
    if (codeFiles.length > maxFiles) {
      allContent += `... and ${codeFiles.length - maxFiles} more files\n`;
      allContent += `Use the 'list_package_files' tool to see all files, then fetch specific files as needed.\n`;
    }
    
    const textContent: TextContent = {
      type: 'text',
      text: allContent,
    };

    return { content: [textContent] };
  }

  private async fetchPackageInfo(packageName: string, version?: string): Promise<PackageInfo> {
    return new Promise((resolve, reject) => {
      const url = version 
        ? `https://registry.npmjs.org/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`
        : `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
      
      const request = https.get(url, (res) => {
        let data = '';
        
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        
        res.on('end', () => {
          try {
            const packageInfo = JSON.parse(data) as PackageInfo;
            
            if (!packageInfo.dist || !packageInfo.dist.tarball) {
              reject(new Error(`Invalid package info: missing tarball URL`));
              return;
            }
            
            resolve(packageInfo);
          } catch (error) {
            reject(new Error(`Invalid JSON response: ${error instanceof Error ? error.message : String(error)}`));
          }
        });
      });

      request.on('error', (error) => {
        reject(new Error(`HTTP request failed: ${error.message}`));
      });

      request.setTimeout(10000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  private async downloadAndExtract(tarballUrl: string, packageName: string): Promise<string> {
    const sanitizedName = packageName.replace(/[@\/]/g, '_');
    const extractPath = path.join(this.tempDir, sanitizedName);
    
    // Clean up existing directory
    if (fs.existsSync(extractPath)) {
      fs.rmSync(extractPath, { recursive: true });
    }
    fs.mkdirSync(extractPath, { recursive: true });

    return new Promise((resolve, reject) => {
      const request = https.get(tarballUrl, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: Failed to download tarball`));
          return;
        }

        const gunzip = zlib.createGunzip();
        const extract = tar.extract({
          cwd: extractPath,
          strip: 1, // Remove the 'package' directory wrapper
        });

        res.pipe(gunzip).pipe(extract);

        extract.on('end', () => {
          resolve(extractPath);
        });

        extract.on('error', (error) => {
          reject(new Error(`Extraction failed: ${error.message}`));
        });

        gunzip.on('error', (error) => {
          reject(new Error(`Decompression failed: ${error.message}`));
        });
      });

      request.on('error', (error) => {
        reject(new Error(`Download failed: ${error.message}`));
      });

      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
  }

  private async findCodeFiles(dir: string): Promise<CodeFile[]> {
    const files: CodeFile[] = [];
    
    const walk = (currentDir: string): void => {
      try {
        const items = fs.readdirSync(currentDir);
        
        for (const item of items) {
          const fullPath = path.join(currentDir, item);
          
          try {
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory() && !this.shouldSkipDirectory(item)) {
              walk(fullPath);
            } else if (stat.isFile() && this.isCodeFile(item)) {
              try {
                const content = fs.readFileSync(fullPath, 'utf8');
                files.push({ path: fullPath, content });
              } catch (error) {
                // Skip files that can't be read (binary, permissions, etc.)
                console.error(`Skipping unreadable file: ${fullPath}`);
              }
            }
          } catch (error) {
            // Skip items that can't be stat'd
            console.error(`Skipping inaccessible item: ${fullPath}`);
          }
        }
      } catch (error) {
        // Skip directories that can't be read
        console.error(`Skipping unreadable directory: ${currentDir}`);
      }
    };
    
    walk(dir);
    return files;
  }

  private async getAllFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    const walk = (currentDir: string): void => {
      try {
        const items = fs.readdirSync(currentDir);
        
        for (const item of items) {
          const fullPath = path.join(currentDir, item);
          
          try {
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory() && !item.startsWith('.')) {
              walk(fullPath);
            } else if (stat.isFile()) {
              files.push(fullPath);
            }
          } catch (error) {
            // Skip items that can't be stat'd
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    };
    
    walk(dir);
    return files;
  }

  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = ['.git', '.svn', '.hg', 'node_modules', '.DS_Store', '__pycache__'];
    return dirName.startsWith('.') || skipDirs.includes(dirName);
  }

  private isCodeFile(fileName: string): boolean {
    const ext = path.extname(fileName).toLowerCase();
    return this.codeExtensions.includes(ext);
  }

  public async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('NPM Package MCP server running on stdio');
  }

  public cleanup(): void {
    if (fs.existsSync(this.tempDir)) {
      try {
        fs.rmSync(this.tempDir, { recursive: true });
      } catch (error) {
        console.error(`Failed to cleanup temp directory: ${error}`);
      }
    }
  }
}

// Handle cleanup
process.on('SIGINT', () => {
  console.error('Received SIGINT, cleaning up...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('Received SIGTERM, cleaning up...');
  process.exit(0);
});

// Start the server
const server = new NpmPackageServer();

// Cleanup on exit
process.on('exit', () => {
  server.cleanup();
});

server.run().catch((error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});