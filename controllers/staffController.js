import Staff from '../models/Staff.js';

// Get all staff members
export const getStaff = async (req, res) => {
    try {
        const { active } = req.query;
        const query = {};
        if (active !== undefined) {
            query.isActive = active === 'true';
        }
        const staff = await Staff.find(query).sort({ name: 1 });
        res.json({ success: true, data: staff });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get single staff member
export const getStaffById = async (req, res) => {
    try {
        const staff = await Staff.findById(req.params.id);
        if (!staff) {
            return res.status(404).json({ success: false, message: 'Staff member not found' });
        }
        res.json({ success: true, data: staff });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Create staff member
export const createStaff = async (req, res) => {
    try {
        const staff = await Staff.create(req.body);
        res.status(201).json({ success: true, data: staff });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// Update staff member
export const updateStaff = async (req, res) => {
    try {
        const staff = await Staff.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!staff) {
            return res.status(404).json({ success: false, message: 'Staff member not found' });
        }
        res.json({ success: true, data: staff });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// Delete staff member (soft delete)
export const deleteStaff = async (req, res) => {
    try {
        const staff = await Staff.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );
        if (!staff) {
            return res.status(404).json({ success: false, message: 'Staff member not found' });
        }
        res.json({ success: true, data: staff, message: 'Staff member deactivated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get labor cost summary
export const getLaborCostSummary = async (req, res) => {
    try {
        const activeStaff = await Staff.find({ isActive: true });

        const monthlyCost = activeStaff.reduce((sum, staff) => {
            if (staff.paymentSchedule === 'monthly') {
                return sum + staff.salary;
            } else if (staff.paymentSchedule === 'weekly') {
                return sum + (staff.salary * 4); // 4 weeks
            } else if (staff.paymentSchedule === 'daily') {
                return sum + (staff.salary * 26); // ~26 working days
            }
            return sum;
        }, 0);

        const staffBreakdown = activeStaff.map(s => ({
            name: s.name,
            role: s.role,
            salary: s.salary,
            paymentSchedule: s.paymentSchedule,
            monthlyEquivalent: s.paymentSchedule === 'monthly' ? s.salary :
                s.paymentSchedule === 'weekly' ? s.salary * 4 : s.salary * 26
        }));

        res.json({
            success: true,
            data: {
                totalStaff: activeStaff.length,
                monthlyLaborCost: monthlyCost,
                dailyLaborCost: monthlyCost / 30,
                staffBreakdown
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
