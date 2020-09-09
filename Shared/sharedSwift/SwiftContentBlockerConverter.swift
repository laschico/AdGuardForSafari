//
//  SwiftContentBlockerConverter.swift
//  shared
//
//  Created by Roman Sokolov on 08.09.2020.
//  Copyright © 2020 Adguard Software Ltd. All rights reserved.
//

import Cocoa

@objc(SwiftContentBlockerConverter)
open class SwiftContentBlockerConverter: NSObject {
    
    /**
     * Total entries count in result
     */
    @objc public private(set) var totalConvertedCount = 0
    
    /**
     * Entries count in result after reducing to limit if provided
     */
    @objc public private(set) var  convertedCount = 0
    
    /**
     * Count of errors handled
     */
    @objc public private(set) var  errorsCount = 0
    
    /**
     * Is provided limit exceeded
     */
    @objc public private(set) var  overLimit = false
    
    /**
     * Json string of content blocker rules
     */
    @objc public private(set) var  converted = "";
    
    /**
     * Count of entries in advanced blocking part
     */
    @objc public private(set) var  advancedBlockingConvertedCount = 0;
    
    /**
     * Json string of advanced content blocker rules
     */
    @objc public private(set) var  advancedBlocking: String? = nil;

    @objc public func convertArray(rules: [String], limit: Int = 0, optimize: Bool = false, advancedBlocking: Bool = false) -> Bool {
        if let result = converter.convertArray(rules: rules, limit: limit, optimize: optimize, advancedBlocking: advancedBlocking) {
            self.totalConvertedCount = result.totalConvertedCount
            self.convertedCount = result.convertedCount
            self.errorsCount = result.errorsCount
            self.overLimit = result.overLimit
            self.converted = result.converted
            self.advancedBlockingConvertedCount = result.advancedBlockingConvertedCount
            self.advancedBlocking = result.advancedBlocking
            return true
        }
        return false
    }
    
    private let converter = ContentBlockerConverter()
}
