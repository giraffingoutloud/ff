/**
 * Name normalization service to handle mismatches between data sources
 * Standardizes player names for better matching
 */

export class NameNormalizer {
  /**
   * Normalize a player name for comparison
   * Removes periods, standardizes suffixes, handles special cases
   */
  normalize(name: string): string {
    if (!name) return '';
    
    let normalized = name.trim();
    
    // Standardize suffixes (remove periods, normalize spacing)
    normalized = normalized
      .replace(/\sJr\.?$/i, ' Jr')
      .replace(/\sSr\.?$/i, ' Sr')
      .replace(/\sIII$/i, ' III')
      .replace(/\sII$/i, ' II')
      .replace(/\sIV$/i, ' IV')
      .replace(/\sV$/i, ' V');
    
    // Remove any remaining periods
    normalized = normalized.replace(/\./g, '');
    
    // Standardize apostrophes
    normalized = normalized.replace(/['']/g, "'");
    
    // Standardize hyphens
    normalized = normalized.replace(/[‐‑–—]/g, '-');
    
    return normalized;
  }
  
  /**
   * Generate name variations for matching
   * Returns array of possible name formats
   */
  getVariations(name: string): string[] {
    if (!name) return [];
    
    const variations = new Set<string>();
    const normalized = this.normalize(name);
    
    // Add original and normalized
    variations.add(name);
    variations.add(normalized);
    
    // Without suffix variations
    const withoutSuffixes = normalized
      .replace(/\s(Jr|Sr|III|II|IV|V)$/i, '')
      .trim();
    variations.add(withoutSuffixes);
    
    // With period suffixes (opposite of normalized)
    if (normalized.includes(' Jr')) {
      variations.add(normalized.replace(' Jr', ' Jr.'));
    }
    if (normalized.includes(' Sr')) {
      variations.add(normalized.replace(' Sr', ' Sr.'));
    }
    
    // Lowercase versions
    variations.add(normalized.toLowerCase());
    variations.add(withoutSuffixes.toLowerCase());
    
    // First and last name only (for complex names)
    const parts = withoutSuffixes.split(' ');
    if (parts.length > 2) {
      variations.add(`${parts[0]} ${parts[parts.length - 1]}`);
    }
    
    return Array.from(variations);
  }
  
  /**
   * Check if two names match after normalization
   */
  match(name1: string, name2: string): boolean {
    if (!name1 || !name2) return false;
    
    // Direct normalized match
    if (this.normalize(name1) === this.normalize(name2)) {
      return true;
    }
    
    // Check if any variations match
    const variations1 = this.getVariations(name1);
    const variations2 = this.getVariations(name2);
    
    for (const v1 of variations1) {
      for (const v2 of variations2) {
        if (v1.toLowerCase() === v2.toLowerCase()) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Find best match from a list of names
   */
  findBestMatch(targetName: string, candidates: string[]): string | null {
    // First try exact normalized match
    const normalized = this.normalize(targetName);
    for (const candidate of candidates) {
      if (this.normalize(candidate) === normalized) {
        return candidate;
      }
    }
    
    // Then try variations
    for (const candidate of candidates) {
      if (this.match(targetName, candidate)) {
        return candidate;
      }
    }
    
    return null;
  }
}

export const nameNormalizer = new NameNormalizer();