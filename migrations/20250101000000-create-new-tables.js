'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create leave_types table
    await queryInterface.createTable('leave_types', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      default_entitlement: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Create work_calendar_policy table
    await queryInterface.createTable('work_calendar_policies', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // Saturday rule: odd saturdays off (1st, 3rd, 5th), even saturdays working
      odd_saturdays_off: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      // Working days per week (typically 5 or 6)
      working_days_per_week: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 5,
      },
      // Standard working hours per day
      standard_hours_per_day: {
        type: Sequelize.DECIMAL(4, 2),
        allowNull: false,
        defaultValue: 8.0,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      effective_from: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      effective_to: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Create salary_structures table
    await queryInterface.createTable('salary_structures', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      employee_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      basic: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      hra: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      allowances: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      deductions: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      effective_from: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      effective_to: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Create employee_documents table
    await queryInterface.createTable('employee_documents', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      employee_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      type: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      category: {
        type: Sequelize.ENUM('personal', 'company', 'hr_manual', 'onsite_manual', 'policy', 'contract', 'payslip', 'id_proof', 'certificate', 'other'),
        allowNull: false,
        defaultValue: 'personal',
      },
      file_key: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      original_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      mime_type: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      file_size: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
      uploaded_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      verified_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
      },
      verified_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      is_verified: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      visibility: {
        type: Sequelize.ENUM('private', 'team', 'company', 'hr_only'),
        allowNull: false,
        defaultValue: 'private',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Create trainings table
    await queryInterface.createTable('trainings', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      duration_hours: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_mandatory: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      validity_months: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Certification validity in months, null = no expiry',
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Create training_assignments table
    await queryInterface.createTable('training_assignments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      employee_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      training_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'trainings', key: 'id' },
        onDelete: 'CASCADE',
      },
      assigned_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      due_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE'),
        allowNull: false,
        defaultValue: 'NOT_STARTED',
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      certificate_file_key: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Create certifications table
    await queryInterface.createTable('certifications', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      employee_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      issuer: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      issue_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      expiry_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      certificate_file_key: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      credential_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      credential_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Create notifications table
    await queryInterface.createTable('notifications', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      type: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      related_entity_type: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      related_entity_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      channels: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: { inApp: true, email: false },
      },
      priority: {
        type: Sequelize.ENUM('Low', 'Normal', 'High', 'Urgent'),
        allowNull: false,
        defaultValue: 'Normal',
      },
      read: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      read_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Create indexes
    await queryInterface.addIndex('leave_types', ['name'], { unique: true });
    await queryInterface.addIndex('salary_structures', ['employee_id', 'effective_from']);
    await queryInterface.addIndex('employee_documents', ['employee_id']);
    await queryInterface.addIndex('employee_documents', ['employee_id', 'category']);
    await queryInterface.addIndex('training_assignments', ['employee_id', 'training_id'], { unique: true });
    await queryInterface.addIndex('training_assignments', ['employee_id', 'status']);
    await queryInterface.addIndex('training_assignments', ['due_date', 'status']);
    await queryInterface.addIndex('certifications', ['employee_id']);
    await queryInterface.addIndex('notifications', ['user_id', 'read']);
    await queryInterface.addIndex('notifications', ['user_id', 'created_at']);
    await queryInterface.addIndex('work_calendar_policies', ['is_active', 'effective_from']);

    // Add indexes to existing tables if not present
    await queryInterface.addIndex('leaves', ['employee_id', 'status']);
    await queryInterface.addIndex('leaves', ['from', 'to']);
    await queryInterface.addIndex('payrolls', ['employee_id', 'period'], { unique: true });
    await queryInterface.addIndex('payrolls', ['period', 'status']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('notifications');
    await queryInterface.dropTable('certifications');
    await queryInterface.dropTable('training_assignments');
    await queryInterface.dropTable('trainings');
    await queryInterface.dropTable('employee_documents');
    await queryInterface.dropTable('salary_structures');
    await queryInterface.dropTable('work_calendar_policies');
    await queryInterface.dropTable('leave_types');
  },
};