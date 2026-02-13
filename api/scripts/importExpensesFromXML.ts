import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import xmljs from 'xml-js';
import User from '../src/models/User';
import Group from '../src/models/Group';
import Expense from '../src/models/Expense';
import { connectDB } from '../src/config/db';

const importExpenses = async () => {
  await connectDB();

  try {
    const user = await User.findOne({ nombre: 'jarklos' });
    if (!user) {
      console.error('User "jarklos" not found');
      return;
    }

    let group = await Group.findOne({ nombre: 'Mis gastos' });
    if (!group) {
        console.log("Creating group 'Mis gastos'...");
        group = new Group({
            nombre: 'Mis gastos',
            miembros: [user._id],
            creado_por: user._id,
        });
        await group.save();
    }

    const xmlFileNames = [
      'MisFinanzasMovimientos20260211220916750000.xml',
      'MisFinanzasMovimientos20260211221107278000.xml',
    ];

    for (const xmlFileName of xmlFileNames) {
      const xmlPath = path.resolve(__dirname, '../../', xmlFileName);
      const xmlData = fs.readFileSync(xmlPath, 'utf8');
      const jsonData = xmljs.xml2json(xmlData, { compact: true, spaces: 2 });
      const parsedData = JSON.parse(jsonData);

      const rows = parsedData.Workbook.Worksheet.Table.Row;

      // Find the header row to map columns dynamically
      const headerRow = rows.find((row: any) =>
        Array.isArray(row.Cell) &&
        row.Cell.some((cell: any) => cell.Data && cell.Data._text === 'Concepto')
      );

      if (!headerRow) continue;

      const header = headerRow.Cell.map((cell: any) => cell.Data ? cell.Data._text : '');
      console.log('Header:', header);
      const conceptIndex = header.indexOf('Concepto');
      const categoryIndex = header.indexOf('Categoría');
      const amountIndex = header.indexOf('Importe (€)');
      const dateIndex = header.indexOf('Fecha');

      for (const row of rows) {
        if (!row.Cell || !Array.isArray(row.Cell) || row.Cell.length < header.length) continue;

        const cells = row.Cell;
        const descriptionCell = cells[conceptIndex];
        const categoryCell = cells[categoryIndex];
        const amountCell = cells[amountIndex];
        const dateCell = cells[dateIndex];

        // Skip header row and rows without necessary data
        if (!descriptionCell || !descriptionCell.Data || descriptionCell.Data._text === 'Concepto' || !amountCell.Data) {
          continue;
        }
        
        const description = descriptionCell.Data._text;
        const categoryName = categoryCell.Data._text;
        const amount = parseFloat(amountCell.Data._text);
        const dateStr = dateCell.Data._text;
        
        if(!dateStr) {
            continue;
        }

        const [day, month, year] = dateStr.split('/');
        const date = new Date(`${year}-${month}-${day}`);


        if (!description || !categoryName || isNaN(amount) || !date) {
            console.log("Skipping row", row)
            continue
        }

        const expense = new Expense({
          descripcion: description,
          monto: Math.abs(amount),
          categoria: [categoryName],
          grupo_id: group._id,
          pagado_por: user._id,
          fecha: date,
        });

        await expense.save();
        console.log(`Expense "${description}" imported.`);
      }
    }

    console.log('All expenses imported successfully.');
  } catch (error) {
    console.error('Error importing expenses:', error);
  } finally {
    mongoose.disconnect();
  }
};

importExpenses();
